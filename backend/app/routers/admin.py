from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_
from datetime import datetime, timedelta
import httpx

from app.core.config import settings
from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User, UserRole
from app.models.code_submission import CodeSubmission
from app.models.collaboration import CollaborationSession, CollaborationParticipant
from app.models.template import Template
from app.models.admin_settings import AdminSettings
from app.services.admin_service import AdminService

router = APIRouter()

# Initialize admin service
admin_service = AdminService(settings)

class UserActivityItem(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    email: Optional[str]
    activity_type: str  # "code_execution", "session_creation", "session_join"
    activity_data: dict
    timestamp: str
    status: Optional[str]
    error_message: Optional[str]

class UserActivityResponse(BaseModel):
    activities: List[UserActivityItem]
    total: int
    page: int
    page_size: int

class AdminStatsResponse(BaseModel):
    total_users: int
    total_code_executions: int
    total_collaboration_sessions: int
    active_sessions: int
    executions_today: int
    new_users_today: int
    error_rate_percentage: float
    popular_languages: List[dict]

class UserDetailsResponse(BaseModel):
    user: dict
    code_executions: int
    collaboration_sessions: int
    recent_activity: List[UserActivityItem]

# Admin authentication dependency
async def get_admin_user(
    current_user: User = Depends(get_current_user)
):
    """Verify that the current user has admin access using secure RBAC"""
    admin_service.verify_admin_access(current_user)
    return current_user

@router.get("/admin/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get overall system statistics"""
    
    # Calculate dates
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    
    # Total counts
    total_users = db.query(User).count()
    total_executions = db.query(CodeSubmission).count()
    total_sessions = db.query(CollaborationSession).count()
    active_sessions = db.query(CollaborationSession).filter(
        CollaborationSession.is_active == True
    ).count()
    
    # Today's stats
    executions_today = db.query(CodeSubmission).filter(
        CodeSubmission.created_at >= today_start
    ).count()
    
    new_users_today = db.query(User).filter(
        User.created_at >= today_start
    ).count()
    
    # Error rate
    error_executions = db.query(CodeSubmission).filter(
        CodeSubmission.status == "error"
    ).count()
    
    error_rate = (error_executions / total_executions * 100) if total_executions > 0 else 0
    
    # Popular languages
    language_stats = db.query(
        CodeSubmission.language,
        func.count(CodeSubmission.id).label('count')
    ).group_by(CodeSubmission.language).order_by(desc('count')).limit(5).all()
    
    popular_languages = [
        {"language": lang, "count": count}
        for lang, count in language_stats
    ]
    
    return AdminStatsResponse(
        total_users=total_users,
        total_code_executions=total_executions,
        total_collaboration_sessions=total_sessions,
        active_sessions=active_sessions,
        executions_today=executions_today,
        new_users_today=new_users_today,
        error_rate_percentage=round(error_rate, 2),
        popular_languages=popular_languages
    )

@router.get("/admin/activities", response_model=UserActivityResponse)
async def get_user_activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    activity_type: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    user_email: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all user activities with filtering"""
    
    activities = []
    
    # Build date filters
    date_filters = []
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            date_filters.append(CodeSubmission.created_at >= date_from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            date_filters.append(CodeSubmission.created_at <= date_to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")
    
    # Get code executions
    if not activity_type or activity_type == "code_execution":
        execution_query = db.query(CodeSubmission).join(
            User, CodeSubmission.user_id == User.id, isouter=True
        )
        
        if user_id:
            execution_query = execution_query.filter(CodeSubmission.user_id == user_id)
        if user_email:
            execution_query = execution_query.filter(User.email == user_email)
        if user_name:
            execution_query = execution_query.filter(User.username == user_name)
        if status:
            execution_query = execution_query.filter(CodeSubmission.status == status)
        if date_filters:
            execution_query = execution_query.filter(and_(*date_filters))
        
        executions = execution_query.order_by(desc(CodeSubmission.created_at)).all()
        
        for execution in executions:
            activities.append(UserActivityItem(
                id=execution.id,
                user_id=execution.user_id,
                username=execution.user.username if execution.user else "Anonymous",
                email=execution.user.email if execution.user else None,
                activity_type="code_execution",
                activity_data={
                    "language": execution.language,
                    "code_size": len(execution.code) if execution.code else 0,
                    "execution_time": execution.execution_time,
                    "input_data": bool(execution.input_data)
                },
                timestamp=execution.created_at.isoformat() if execution.created_at else "",
                status=execution.status,
                error_message=execution.error_message
            ))
    
    # Get collaboration session activities
    if not activity_type or activity_type in ["session_creation", "session_join"]:
        # Session creations
        if not activity_type or activity_type == "session_creation":
            session_query = db.query(CollaborationSession).join(User)
            
            if user_id:
                session_query = session_query.filter(CollaborationSession.owner_id == user_id)
            if user_email:
                session_query = session_query.filter(User.email == user_email)
            if user_name:
                session_query = session_query.filter(User.username == user_name)
            
            sessions = session_query.order_by(desc(CollaborationSession.created_at)).all()
            
            for session in sessions:
                activities.append(UserActivityItem(
                    id=session.id,
                    user_id=session.owner_id,
                    username=session.owner.username,
                    email=session.owner.email,
                    activity_type="session_creation",
                    activity_data={
                        "share_id": session.share_id,
                        "title": session.title,
                        "language": session.language,
                        "is_public": session.is_public,
                        "max_collaborators": session.max_collaborators
                    },
                    timestamp=session.created_at.isoformat() if session.created_at else "",
                    status="active" if session.is_active else "inactive",
                    error_message=None
                ))
        
        # Session joins
        if not activity_type or activity_type == "session_join":
            participant_query = db.query(CollaborationParticipant).join(
                CollaborationSession
            ).join(User, CollaborationParticipant.user_id == User.id, isouter=True)
            
            if user_id:
                participant_query = participant_query.filter(CollaborationParticipant.user_id == user_id)
            if user_email:
                participant_query = participant_query.filter(User.email == user_email)
            if user_name:
                participant_query = participant_query.filter(User.username == user_name)
            
            participants = participant_query.order_by(desc(CollaborationParticipant.joined_at)).all()
            
            for participant in participants:
                activities.append(UserActivityItem(
                    id=participant.id,
                    user_id=participant.user_id,
                    username=participant.username,
                    email=participant.user.email if participant.user else None,
                    activity_type="session_join",
                    activity_data={
                        "session_share_id": participant.session.share_id,
                        "session_title": participant.session.title,
                        "cursor_color": participant.cursor_color,
                        "is_connected": participant.is_connected
                    },
                    timestamp=participant.joined_at.isoformat() if participant.joined_at else "",
                    status="connected" if participant.is_connected else "disconnected",
                    error_message=None
                ))
    
    # Sort activities by timestamp (most recent first)
    activities.sort(key=lambda x: x.timestamp, reverse=True)
    
    # Apply pagination
    total = len(activities)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_activities = activities[start_idx:end_idx]
    
    return UserActivityResponse(
        activities=paginated_activities,
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/admin/users", response_model=List[dict])
async def get_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all users with basic info"""
    
    query = db.query(User)
    
    if search:
        search_filter = or_(
            User.username.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.full_name.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    offset = (page - 1) * page_size
    users = query.order_by(desc(User.created_at)).offset(offset).limit(page_size).all()
    
    result = []
    for user in users:
        execution_count = db.query(CodeSubmission).filter(
            CodeSubmission.user_id == user.id
        ).count()
        
        session_count = db.query(CollaborationSession).filter(
            CollaborationSession.owner_id == user.id
        ).count()
        
        result.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "created_at": user.created_at.isoformat() if user.created_at else "",
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "code_executions": execution_count,
            "collaboration_sessions": session_count
        })
    
    return result

@router.get("/admin/users/{user_id}", response_model=UserDetailsResponse)
async def get_user_details(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get detailed information about a specific user"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get counts
    execution_count = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id
    ).count()
    
    session_count = db.query(CollaborationSession).filter(
        CollaborationSession.owner_id == user_id
    ).count()
    
    # Get recent activity (last 20 items)
    recent_executions = db.query(CodeSubmission).filter(
        CodeSubmission.user_id == user_id
    ).order_by(desc(CodeSubmission.created_at)).limit(10).all()
    
    recent_activity = []
    for execution in recent_executions:
        recent_activity.append(UserActivityItem(
            id=execution.id,
            user_id=execution.user_id,
            username=user.username,
            email=user.email,
            activity_type="code_execution",
            activity_data={
                "language": execution.language,
                "code_size": len(execution.code) if execution.code else 0,
                "execution_time": execution.execution_time
            },
            timestamp=execution.created_at.isoformat() if execution.created_at else "",
            status=execution.status,
            error_message=execution.error_message
        ))
    
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at.isoformat() if user.created_at else "",
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "bio": user.bio,
        "avatar_url": user.avatar_url
    }
    
    return UserDetailsResponse(
        user=user_data,
        code_executions=execution_count,
        collaboration_sessions=session_count,
        recent_activity=recent_activity
    )

@router.delete("/admin/users/{user_id}")
async def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Deactivate a user account"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if admin_service.has_admin_access(user):
        raise HTTPException(status_code=400, detail="Cannot deactivate admin user")
    
    user.is_active = False
    db.commit()
    
    return {"message": f"User {user.username} has been deactivated"}


@router.post("/admin/users/{user_id}/promote")
async def promote_user_to_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Promote a user to admin role"""
    user = admin_service.promote_to_admin(db, user_id, admin_user)
    return {
        "message": f"User {user.username} has been promoted to admin",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "is_admin": user.is_admin
        }
    }


@router.post("/admin/users/{user_id}/demote")
async def demote_user_from_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Demote a user from admin role"""
    user = admin_service.demote_from_admin(db, user_id, admin_user)
    return {
        "message": f"User {user.username} has been demoted from admin",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "is_admin": user.is_admin
        }
    }


@router.get("/admin/users/admins")
async def get_admin_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all users with admin privileges"""
    admins = admin_service.get_admin_users(db)
    return {
        "admins": [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role.value,
                "is_admin": user.is_admin,
                "is_superuser": user.is_superuser,
                "is_initial_admin": admin_service.is_initial_admin_email(user.email)
            }
            for user in admins
        ]
    }


# Admin Settings Endpoints

@router.get("/admin/settings")
async def get_admin_settings(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get current admin settings (Admin only)"""
    try:
        settings = AdminSettings.get_or_create_default(db)
        return {
            "id": settings.id,
            "copy_paste_enabled": settings.copy_paste_enabled,
            "updated_by": settings.updated_by,
            "updated_at": settings.updated_at,
            "notes": settings.notes
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get admin settings: {str(e)}"
        )


class AdminSettingsUpdate(BaseModel):
    copy_paste_enabled: bool
    notes: Optional[str] = None


@router.put("/admin/settings")
async def update_admin_settings(
    settings_update: AdminSettingsUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Update admin settings (Admin only)"""
    try:
        # Get existing settings or create default
        settings = AdminSettings.get_or_create_default(db)
        
        # Update settings
        settings.copy_paste_enabled = settings_update.copy_paste_enabled
        settings.updated_by = admin_user.username
        if settings_update.notes is not None:
            settings.notes = settings_update.notes
            
        db.commit()
        db.refresh(settings)
        
        # Broadcast settings change to all connected clients via websocket service
        try:
            websocket_url = "http://localhost:8007/api/broadcast/admin-settings"  # WebSocket service URL
            broadcast_data = {
                "event": "admin_settings_changed",
                "data": {
                    "copy_paste_enabled": settings.copy_paste_enabled,
                    "updated_by": admin_user.username
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(websocket_url, json=broadcast_data, timeout=5.0)
                if response.status_code == 200:
                    print(f"✅ Successfully broadcasted admin settings change to websocket service")
                else:
                    print(f"⚠️ Failed to broadcast admin settings change: {response.status_code}")
        except Exception as broadcast_error:
            print(f"⚠️ Failed to broadcast admin settings change: {str(broadcast_error)}")
            # Don't fail the request if broadcast fails
        
        return {
            "message": "Admin settings updated successfully",
            "settings": {
                "id": settings.id,
                "copy_paste_enabled": settings.copy_paste_enabled,
                "updated_by": settings.updated_by,
                "updated_at": settings.updated_at,
                "notes": settings.notes
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update admin settings: {str(e)}"
        )


@router.get("/admin/settings/public")
async def get_public_admin_settings(
    db: Session = Depends(get_db)
):
    """Get public admin settings (no authentication required)"""
    try:
        settings = AdminSettings.get_or_create_default(db)
        return {
            "copy_paste_enabled": settings.copy_paste_enabled
        }
    except Exception as e:
        # Return default values if settings can't be retrieved
        return {
            "copy_paste_enabled": True
        }

@router.post("/admin/users/{user_id}/activate")
async def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Activate a user account"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = True
    db.commit()
    
    return {"message": f"User {user.username} has been activated"}

class TemplateExecutionItem(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    email: Optional[str]
    full_name: Optional[str]
    template_id: Optional[int]
    template_name: Optional[str]
    code: str
    language: str
    input_data: Optional[str]
    output: Optional[str]
    error_message: Optional[str]
    execution_time: Optional[float]
    status: Optional[str]
    created_at: str
    executed_at: Optional[str]

class TemplateExecutionResponse(BaseModel):
    executions: List[TemplateExecutionItem]
    total: int
    page: int
    page_size: int

@router.get("/admin/template-executions", response_model=TemplateExecutionResponse)
async def get_template_executions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    template_id: Optional[int] = Query(None),
    template_name: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get template executions with filtering options"""
    
    # Build query for code submissions that used templates
    query = db.query(CodeSubmission).join(User, CodeSubmission.user_id == User.id, isouter=True)
    query = query.join(Template, CodeSubmission.template_id == Template.id, isouter=True)
    
    # Apply filters
    filters = []
    
    if template_id:
        filters.append(CodeSubmission.template_id == template_id)
    
    if template_name:
        filters.append(Template.name == template_name)
    
    if user_email:
        filters.append(User.email == user_email)
    
    if user_name:
        filters.append(User.username == user_name)
    
    if language:
        filters.append(CodeSubmission.language == language)
    
    if status:
        filters.append(CodeSubmission.status == status)
    
    # Date filters
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            filters.append(CodeSubmission.created_at >= date_from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            filters.append(CodeSubmission.created_at <= date_to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")
    
    # Apply all filters
    if filters:
        query = query.filter(and_(*filters))
    
    # Get total count
    total = query.count()
    
    # Apply pagination and ordering
    offset = (page - 1) * page_size
    executions = query.order_by(desc(CodeSubmission.created_at)).offset(offset).limit(page_size).all()
    
    # Format response
    execution_items = []
    for execution in executions:
        execution_items.append(TemplateExecutionItem(
            id=execution.id,
            user_id=execution.user_id,
            username=execution.user.username if execution.user else None,
            email=execution.user.email if execution.user else None,
            full_name=execution.user.full_name if execution.user else None,
            template_id=execution.template_id,
            template_name=execution.template.name if execution.template else None,
            code=execution.code,
            language=execution.language,
            input_data=execution.input_data,
            output=execution.output,
            error_message=execution.error_message,
            execution_time=execution.execution_time,
            status=execution.status,
            created_at=execution.created_at.isoformat() if execution.created_at else "",
            executed_at=execution.executed_at.isoformat() if execution.executed_at else None
        ))
    
    return TemplateExecutionResponse(
        executions=execution_items,
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/admin/templates-list")
async def get_templates_list(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all templates for dropdown filter"""
    templates = db.query(Template).filter(Template.is_active == True).all()
    
    return {
        "templates": [
            {
                "id": template.id,
                "name": template.name,
                "language": template.language
            }
            for template in templates
        ]
    }

@router.get("/admin/users-list")
async def get_users_list(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all users for dropdown filters"""
    users = db.query(User).filter(User.is_active == True).all()
    
    # Get combined user data (username and email)
    combined_users = []
    for user in users:
        if user.username and user.email:
            combined_users.append({
                "username": user.username,
                "email": user.email,
                "display": f"{user.username} ({user.email})"
            })
    
    # Sort by username
    combined_users.sort(key=lambda x: x["username"])
    
    # For backward compatibility, also return separate arrays
    usernames = list(set([user.username for user in users if user.username]))
    emails = list(set([user.email for user in users if user.email]))
    
    return {
        "users": combined_users,
        "usernames": sorted(usernames),
        "emails": sorted(emails)
    }

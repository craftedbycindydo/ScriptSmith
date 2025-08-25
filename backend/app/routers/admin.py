from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_, text
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
from app.models.classroom import Classroom, UserClassroom
from app.services.admin_service import AdminService
from app.services.classroom_service import ClassroomService
from app.services.railway_optimization_service import railway_performance_monitor
import logging

logger = logging.getLogger(__name__)

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

# Admin authentication dependency with classroom context
async def get_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify that the current user has admin access using secure RBAC"""
    admin_service.verify_admin_access(current_user)
    
    # Get user's classroom context
    classroom_context = ClassroomService.get_classroom_context(db, current_user)
    current_user.classroom_context = classroom_context
    
    return current_user

def get_user_classroom_ids(user: User) -> List[int]:
    """Get list of classroom IDs that the user has access to"""
    if not hasattr(user, 'classroom_context') or not user.classroom_context.get('classrooms'):
        return []
    return [c['id'] for c in user.classroom_context['classrooms']]

@router.get("/admin/stats", response_model=AdminStatsResponse)
@railway_performance_monitor("admin_stats")
async def get_admin_stats(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped system statistics - Optimized for Railway PostgreSQL"""
    from app.services.admin_cache_service import admin_cache
    
    # Get user's classroom IDs
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        # Return empty stats if user has no classrooms
        return AdminStatsResponse(
            total_users=0,
            total_code_executions=0,
            total_collaboration_sessions=0,
            active_sessions=0,
            executions_today=0,
            new_users_today=0,
            error_rate_percentage=0,
            popular_languages=[]
        )
    
    # Try cache first
    cached_stats = admin_cache.get_cached_admin_stats(classroom_ids)
    if cached_stats:
        return AdminStatsResponse(**cached_stats)
    
    # Calculate dates
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    
    # Optimized single query using CTEs to get all stats at once
    stats_query = text("""
        WITH classroom_users AS (
            SELECT DISTINCT u.id as user_id, u.created_at
            FROM users u 
            INNER JOIN user_classrooms uc ON u.id = uc.user_id 
            WHERE uc.classroom_id = ANY(:classroom_ids) AND uc.is_active = true
        ),
        user_submissions AS (
            SELECT cs.*, cu.user_id as classroom_user_id
            FROM code_submissions cs
            LEFT JOIN classroom_users cu ON cs.user_id = cu.user_id
            WHERE (cs.classroom_id = ANY(:classroom_ids) OR 
                  (cs.classroom_id IS NULL AND cu.user_id IS NOT NULL))
        ),
        session_stats AS (
            SELECT col.*, cu.user_id as classroom_user_id
            FROM collaboration_sessions col
            LEFT JOIN classroom_users cu ON col.owner_id = cu.user_id
            WHERE (col.classroom_id = ANY(:classroom_ids) OR 
                  (col.classroom_id IS NULL AND cu.user_id IS NOT NULL))
        )
        SELECT 
            -- Total counts
            (SELECT COUNT(*) FROM classroom_users) as total_users,
            (SELECT COUNT(*) FROM user_submissions) as total_executions,
            (SELECT COUNT(*) FROM session_stats) as total_sessions,
            (SELECT COUNT(*) FROM session_stats WHERE is_active = true) as active_sessions,
            
            -- Today's counts  
            (SELECT COUNT(*) FROM user_submissions WHERE created_at >= :today_start) as executions_today,
            (SELECT COUNT(*) FROM classroom_users WHERE created_at >= :today_start) as new_users_today,
            
            -- Error rate
            (SELECT COUNT(*) FROM user_submissions WHERE status = 'error') as error_executions
    """)
    
    # Execute the optimized query
    result = db.execute(stats_query, {
        'classroom_ids': classroom_ids,
        'today_start': today_start
    }).fetchone()
    
    # Calculate error rate
    total_executions = result.total_executions or 0
    error_executions = result.error_executions or 0
    error_rate = (error_executions / total_executions * 100) if total_executions > 0 else 0
    
    # Get popular languages with optimized query
    language_query = text("""
        WITH classroom_users AS (
            SELECT DISTINCT u.id as user_id
            FROM users u 
            INNER JOIN user_classrooms uc ON u.id = uc.user_id 
            WHERE uc.classroom_id = ANY(:classroom_ids) AND uc.is_active = true
        )
        SELECT cs.language, COUNT(*) as count
        FROM code_submissions cs
        LEFT JOIN classroom_users cu ON cs.user_id = cu.user_id
        WHERE (cs.classroom_id = ANY(:classroom_ids) OR 
              (cs.classroom_id IS NULL AND cu.user_id IS NOT NULL))
          AND cs.language IS NOT NULL
        GROUP BY cs.language 
        ORDER BY count DESC 
        LIMIT 5
    """)
    
    language_results = db.execute(language_query, {'classroom_ids': classroom_ids}).fetchall()
    popular_languages = [
        {"language": row.language, "count": row.count}
        for row in language_results
    ]
    
    stats_data = {
        "total_users": result.total_users or 0,
        "total_code_executions": total_executions,
        "total_collaboration_sessions": result.total_sessions or 0,
        "active_sessions": result.active_sessions or 0,
        "executions_today": result.executions_today or 0,
        "new_users_today": result.new_users_today or 0,
        "error_rate_percentage": round(error_rate, 2),
        "popular_languages": popular_languages
    }
    
    # Cache the results
    admin_cache.cache_admin_stats(classroom_ids, stats_data)
    
    return AdminStatsResponse(**stats_data)

@router.get("/admin/activities", response_model=UserActivityResponse)
@railway_performance_monitor("admin_activities")
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
    """Get all user activities with filtering - Optimized for Railway PostgreSQL"""
    from app.services.admin_cache_service import admin_cache
    
    # Parse dates
    date_from_dt = None
    date_to_dt = None
    
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")
    
    # Get classroom IDs
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return UserActivityResponse(activities=[], total=0, page=page, page_size=page_size)
    
    # Build cache key for filtering
    filter_params = {
        'classroom_ids': sorted(classroom_ids),
        'activity_type': activity_type,
        'user_id': user_id,
        'user_email': user_email,
        'user_name': user_name,
        'date_from': date_from,
        'date_to': date_to,
        'status': status,
        'page': page,
        'page_size': page_size
    }
    
    # Try cache first
    cached_activities = admin_cache.get_cached_user_activities(filter_params)
    if cached_activities:
        return UserActivityResponse(**cached_activities)
    
    # Optimized single query using UNION ALL for different activity types
    offset = (page - 1) * page_size
    
    # Build WHERE conditions for the query
    where_conditions = []
    query_params = {'classroom_ids': classroom_ids, 'offset': offset, 'page_size': page_size}
    
    if user_id:
        where_conditions.append("u.id = :user_id")
        query_params['user_id'] = user_id
    if user_email:
        where_conditions.append("u.email = :user_email")
        query_params['user_email'] = user_email
    if user_name:
        where_conditions.append("u.username = :user_name")
        query_params['user_name'] = user_name
    if date_from_dt:
        where_conditions.append("activity_timestamp >= :date_from")
        query_params['date_from'] = date_from_dt
    if date_to_dt:
        where_conditions.append("activity_timestamp <= :date_to")
        query_params['date_to'] = date_to_dt
    if status and activity_type == "code_execution":
        where_conditions.append("activity_status = :status")
        query_params['status'] = status
    
    where_clause = " AND " + " AND ".join(where_conditions) if where_conditions else ""
    
    # Optimized unified query for all activity types
    activities_query = text(f"""
        WITH classroom_users AS (
            SELECT DISTINCT u.id as user_id
            FROM users u 
            INNER JOIN user_classrooms uc ON u.id = uc.user_id 
            WHERE uc.classroom_id = ANY(:classroom_ids) AND uc.is_active = true
        ),
        all_activities AS (
            -- Code executions
            SELECT 
                cs.id,
                cs.user_id,
                u.username,
                u.email,
                'code_execution' as activity_type,
                json_build_object(
                    'language', cs.language,
                    'code_size', CASE WHEN cs.code IS NOT NULL THEN length(cs.code) ELSE 0 END,
                    'execution_time', cs.execution_time,
                    'input_data', cs.input_data IS NOT NULL
                ) as activity_data,
                cs.created_at as activity_timestamp,
                cs.status as activity_status,
                cs.error_message
            FROM code_submissions cs
            LEFT JOIN users u ON cs.user_id = u.id
            LEFT JOIN classroom_users cu ON cs.user_id = cu.user_id
            WHERE (cs.classroom_id = ANY(:classroom_ids) OR 
                  (cs.classroom_id IS NULL AND cu.user_id IS NOT NULL))
              AND (:activity_type IS NULL OR :activity_type = 'code_execution')
            
            UNION ALL
            
            -- Session creations
            SELECT 
                col.id,
                col.owner_id as user_id,
                u.username,
                u.email,
                'session_creation' as activity_type,
                json_build_object(
                    'share_id', col.share_id,
                    'title', col.title,
                    'language', col.language,
                    'is_public', col.is_public,
                    'max_collaborators', col.max_collaborators
                ) as activity_data,
                col.created_at as activity_timestamp,
                CASE WHEN col.is_active THEN 'active' ELSE 'inactive' END as activity_status,
                NULL as error_message
            FROM collaboration_sessions col
            LEFT JOIN users u ON col.owner_id = u.id
            LEFT JOIN classroom_users cu ON col.owner_id = cu.user_id
            WHERE (col.classroom_id = ANY(:classroom_ids) OR 
                  (col.classroom_id IS NULL AND cu.user_id IS NOT NULL))
              AND (:activity_type IS NULL OR :activity_type = 'session_creation')
            
            UNION ALL
            
            -- Session joins
            SELECT 
                cp.id,
                cp.user_id,
                cp.username,
                u.email,
                'session_join' as activity_type,
                json_build_object(
                    'session_share_id', col.share_id,
                    'session_title', col.title,
                    'cursor_color', cp.cursor_color,
                    'is_connected', cp.is_connected
                ) as activity_data,
                cp.joined_at as activity_timestamp,
                CASE WHEN cp.is_connected THEN 'connected' ELSE 'disconnected' END as activity_status,
                NULL as error_message
            FROM collaboration_participants cp
            LEFT JOIN collaboration_sessions col ON cp.session_id = col.id
            LEFT JOIN users u ON cp.user_id = u.id
            WHERE (:activity_type IS NULL OR :activity_type = 'session_join')
        ),
        filtered_activities AS (
            SELECT * FROM all_activities
            WHERE 1=1 {where_clause}
        ),
        paginated_activities AS (
            SELECT *, COUNT(*) OVER() as total_count
            FROM filtered_activities
            ORDER BY activity_timestamp DESC
            LIMIT :page_size OFFSET :offset
        )
        SELECT * FROM paginated_activities
    """)
    
    # Add activity_type to query params
    query_params['activity_type'] = activity_type
    
    results = db.execute(activities_query, query_params).fetchall()
    
    activities = []
    total = 0
    
    for row in results:
        total = row.total_count if hasattr(row, 'total_count') else 0
        activities.append(UserActivityItem(
            id=row.id,
            user_id=row.user_id,
            username=row.username or "Anonymous",
            email=row.email,
            activity_type=row.activity_type,
            activity_data=row.activity_data,
            timestamp=row.activity_timestamp.isoformat() if row.activity_timestamp else "",
            status=row.activity_status,
            error_message=row.error_message
        ))
    
    result = {
        "activities": activities,
        "total": total,
        "page": page,
        "page_size": page_size
    }
    
    # Cache the results
    admin_cache.cache_user_activities(filter_params, result)
    
    return UserActivityResponse(**result)

@router.get("/admin/users", response_model=List[dict])
@railway_performance_monitor("admin_users")
async def get_all_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get classroom-scoped users with basic info - Optimized for Railway PostgreSQL"""
    
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return []
    
    # Build optimized single query with JOINs instead of N+1 queries
    offset = (page - 1) * page_size
    
    # Optimized query that gets users with their counts in one go
    user_query = text("""
        WITH classroom_users AS (
            SELECT DISTINCT u.id, u.username, u.email, u.full_name, 
                   u.is_active, u.is_verified, u.created_at, u.last_login
            FROM users u 
            INNER JOIN user_classrooms uc ON u.id = uc.user_id 
            WHERE uc.classroom_id = ANY(:classroom_ids) 
              AND uc.is_active = true
              AND (:search IS NULL OR 
                   u.username ILIKE :search_pattern OR 
                   u.email ILIKE :search_pattern OR 
                   u.full_name ILIKE :search_pattern)
        ),
        user_stats AS (
            SELECT 
                cu.id,
                cu.username,
                cu.email,
                cu.full_name,
                cu.is_active,
                cu.is_verified,
                cu.created_at,
                cu.last_login,
                COALESCE(exec_counts.execution_count, 0) as code_executions,
                COALESCE(session_counts.session_count, 0) as collaboration_sessions
            FROM classroom_users cu
            LEFT JOIN (
                SELECT cs.user_id, COUNT(*) as execution_count
                FROM code_submissions cs
                WHERE (cs.classroom_id = ANY(:classroom_ids) OR cs.classroom_id IS NULL)
                GROUP BY cs.user_id
            ) exec_counts ON cu.id = exec_counts.user_id
            LEFT JOIN (
                SELECT col.owner_id as user_id, COUNT(*) as session_count
                FROM collaboration_sessions col
                WHERE (col.classroom_id = ANY(:classroom_ids) OR col.classroom_id IS NULL)
                GROUP BY col.owner_id
            ) session_counts ON cu.id = session_counts.user_id
        )
        SELECT * FROM user_stats
        ORDER BY created_at DESC
        LIMIT :page_size OFFSET :offset
    """)
    
    search_pattern = f"%{search}%" if search else None
    
    results = db.execute(user_query, {
        'classroom_ids': classroom_ids,
        'search': search,
        'search_pattern': search_pattern,
        'page_size': page_size,
        'offset': offset
    }).fetchall()
    
    return [
        {
            "id": row.id,
            "username": row.username,
            "email": row.email,
            "full_name": row.full_name,
            "is_active": row.is_active,
            "is_verified": row.is_verified,
            "created_at": row.created_at.isoformat() if row.created_at else "",
            "last_login": row.last_login.isoformat() if row.last_login else None,
            "code_executions": row.code_executions,
            "collaboration_sessions": row.collaboration_sessions
        }
        for row in results
    ]

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
    """Get current admin settings for user's primary classroom (Admin only)"""
    try:
        classroom_ids = get_user_classroom_ids(admin_user)
        if not classroom_ids:
            raise HTTPException(
                status_code=404,
                detail="No classroom found for user"
            )
        
        # Use the first classroom for admin settings
        primary_classroom_id = classroom_ids[0]
        settings = AdminSettings.get_or_create_default(db, primary_classroom_id)
        
        return {
            "id": settings.id,
            "classroom_id": settings.classroom_id,
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
    """Update admin settings for user's primary classroom (Admin only)"""
    try:
        classroom_ids = get_user_classroom_ids(admin_user)
        if not classroom_ids:
            raise HTTPException(
                status_code=404,
                detail="No classroom found for user"
            )
        
        # Use the first classroom for admin settings
        primary_classroom_id = classroom_ids[0]
        admin_settings = AdminSettings.get_or_create_default(db, primary_classroom_id)
        
        # Update settings
        admin_settings.copy_paste_enabled = settings_update.copy_paste_enabled
        admin_settings.updated_by = admin_user.username
        if settings_update.notes is not None:
            admin_settings.notes = settings_update.notes
            
        db.commit()
        db.refresh(admin_settings)
        
        # Broadcast settings change to classroom-specific clients via websocket service
        try:
            websocket_url = f"{settings.websocket_service_url}/api/broadcast/admin-settings"  # WebSocket service URL
            broadcast_data = {
                "event": "admin_settings_changed",
                "classroom_id": primary_classroom_id,
                "data": {
                    "copy_paste_enabled": admin_settings.copy_paste_enabled,
                    "updated_by": admin_user.username,
                    "classroom_id": primary_classroom_id
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
                "id": admin_settings.id,
                "copy_paste_enabled": admin_settings.copy_paste_enabled,
                "updated_by": admin_settings.updated_by,
                "updated_at": admin_settings.updated_at,
                "notes": admin_settings.notes
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update admin settings: {str(e)}"
        )

# Per-classroom admin settings endpoints
@router.get("/admin/classrooms/{classroom_id}/settings")
async def get_classroom_admin_settings(
    classroom_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get admin settings for a specific classroom (Admin only)"""
    try:
        # Validate admin has access to this classroom
        classroom_ids = get_user_classroom_ids(admin_user)
        if classroom_id not in classroom_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this classroom"
            )
        
        settings = AdminSettings.get_or_create_default(db, classroom_id)
        
        return {
            "id": settings.id,
            "classroom_id": settings.classroom_id,
            "copy_paste_enabled": settings.copy_paste_enabled,
            "updated_by": settings.updated_by,
            "updated_at": settings.updated_at,
            "notes": settings.notes
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get admin settings: {str(e)}"
        )

@router.put("/admin/classrooms/{classroom_id}/settings")
async def update_classroom_admin_settings(
    classroom_id: int,
    settings_update: AdminSettingsUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Update admin settings for a specific classroom (Admin only)"""
    try:
        # Validate admin has access to this classroom
        classroom_ids = get_user_classroom_ids(admin_user)
        if classroom_id not in classroom_ids:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this classroom"
            )
        
        admin_settings = AdminSettings.get_or_create_default(db, classroom_id)
        
        # Update settings
        admin_settings.copy_paste_enabled = settings_update.copy_paste_enabled
        admin_settings.updated_by = admin_user.username
        if settings_update.notes is not None:
            admin_settings.notes = settings_update.notes
            
        db.commit()
        db.refresh(admin_settings)
        
        # Broadcast settings change to classroom-specific clients via websocket service
        try:
            websocket_url = f"{settings.websocket_service_url}/api/broadcast/admin-settings"
            broadcast_data = {
                "event": "admin_settings_changed",
                "classroom_id": classroom_id,
                "data": {
                    "copy_paste_enabled": admin_settings.copy_paste_enabled,
                    "updated_by": admin_user.username,
                    "classroom_id": classroom_id
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(websocket_url, json=broadcast_data, timeout=5.0)
                if response.status_code == 200:
                    print(f"✅ Successfully broadcasted admin settings change for classroom {classroom_id}")
                else:
                    print(f"⚠️ Failed to broadcast admin settings change for classroom {classroom_id}: {response.status_code}")
        except Exception as broadcast_error:
            print(f"⚠️ Failed to broadcast admin settings change for classroom {classroom_id}: {str(broadcast_error)}")
            # Don't fail the request if broadcast fails
        
        return {
            "message": "Admin settings updated successfully",
            "settings": {
                "id": admin_settings.id,
                "classroom_id": admin_settings.classroom_id,
                "copy_paste_enabled": admin_settings.copy_paste_enabled,
                "updated_by": admin_settings.updated_by,
                "updated_at": admin_settings.updated_at,
                "notes": admin_settings.notes
            }
        }
    except HTTPException:
        raise
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
    """Get public admin settings (no authentication required) - returns merged settings for all classrooms"""
    try:
        # Get all classrooms and their settings
        classrooms = db.query(Classroom).all()
        if not classrooms:
            # Return defaults if no classrooms exist yet
            return {
                "copy_paste_enabled": True
            }
        
        # For public access, we need to decide on a policy:
        # If ANY classroom has copy-paste disabled, disable it globally
        # This ensures the most restrictive setting applies
        copy_paste_enabled = True
        
        for classroom in classrooms:
            settings = db.query(AdminSettings).filter(
                AdminSettings.classroom_id == classroom.id
            ).first()
            
            if settings and not settings.copy_paste_enabled:
                copy_paste_enabled = False
                break
        
        return {
            "copy_paste_enabled": copy_paste_enabled
        }
        
    except Exception as e:
        print(f"❌ Error in public admin settings: {str(e)}")
        # Return default values if settings can't be retrieved
        return {
            "copy_paste_enabled": True
        }

@router.get("/admin/settings/user")
async def get_user_admin_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get admin settings for the current user's classroom (authenticated users only)"""
    try:
        # Get user's classroom IDs
        classroom_memberships = db.query(UserClassroom).filter(
            UserClassroom.user_id == current_user.id,
            UserClassroom.is_active == True
        ).all()
        
        if not classroom_memberships:
            # Return defaults if user is not in any classroom
            return {
                "copy_paste_enabled": True
            }
        
        # Use the first classroom's settings (most users are in one classroom)
        first_classroom_id = classroom_memberships[0].classroom_id
        settings = AdminSettings.get_or_create_default(db, first_classroom_id)
        
        return {
            "copy_paste_enabled": settings.copy_paste_enabled,
            "classroom_id": first_classroom_id
        }
        
    except Exception as e:
        print(f"❌ Error in user admin settings: {str(e)}")
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
    """Get classroom-scoped templates for dropdown filter"""
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return {"templates": []}
    
    templates = db.query(Template).filter(
        Template.is_active == True,
        or_(
            Template.classroom_id.in_(classroom_ids),
            Template.classroom_id.is_(None)  # Include legacy templates
        )
    ).all()
    
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
    """Get classroom-scoped users for dropdown filters"""
    classroom_ids = get_user_classroom_ids(admin_user)
    if not classroom_ids:
        return {"users": [], "usernames": [], "emails": []}
    
    users = db.query(User).join(UserClassroom).filter(
        User.is_active == True,
        UserClassroom.classroom_id.in_(classroom_ids),
        UserClassroom.is_active == True
    ).distinct().all()
    
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

@router.get("/admin/migration-status")
async def get_migration_status(
    admin_user: User = Depends(get_admin_user)
):
    """Get database migration and optimization status"""
    try:
        from app.services.database_migration_service import migration_service
        from app.services.railway_optimization_service import optimization_service
        
        migration_status = migration_service.get_migration_status()
        performance_report = optimization_service.get_performance_report()
        
        return {
            "success": True,
            "migration_status": migration_status,
            "performance_optimizations": {
                "applied": any(m.get("name") == "v1_performance_optimization" for m in migration_status.get("migrations", [])),
                "description": "Database indexes and performance optimizations for Railway.app deployment",
                "railway_optimizations": {
                    "version": performance_report.get("optimization_version"),
                    "connection_info": performance_report.get("database_connection_info"),
                    "cache_stats": performance_report.get("cache_stats"),
                    "query_metrics": performance_report.get("query_metrics")
                }
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "migration_status": {"migrations": []},
            "performance_optimizations": {"applied": False, "error": str(e)}
        }

@router.post("/admin/apply-optimizations")
async def apply_railway_optimizations(
    admin_user: User = Depends(get_admin_user)
):
    """Manually apply Railway.app optimizations"""
    try:
        from app.services.database_migration_service import migration_service
        from app.services.railway_optimization_service import optimization_service
        
        # Apply database migrations and optimizations
        migration_result = migration_service.apply_performance_optimizations()
        optimization_service.apply_railway_specific_optimizations()
        
        return {
            "success": True,
            "message": "Railway.app optimizations applied successfully",
            "migration_applied": migration_result
        }
    except Exception as e:
        logger.error(f"Error applying optimizations: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to apply optimizations"
        }

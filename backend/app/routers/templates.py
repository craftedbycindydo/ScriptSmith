from fastapi import APIRouter, HTTPException, Depends, Query, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from datetime import datetime
import os
import time

from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.models.user_template import UserTemplate
from app.models.classroom import Classroom, UserClassroom
from app.services.template_service import TemplateService
from app.services.code_execution import code_execution_service
from app.services.user_template_service import UserTemplateService
from app.services.admin_service import AdminService
from app.core.config import settings

router = APIRouter()

# Initialize admin service
admin_service = AdminService(settings)

# Pydantic models for request/response
class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: str
    code_content: str
    classroom_ids: Optional[List[int]] = None
    submission_deadline: Optional[datetime] = None  # UTC datetime
    exclusions: Optional[List[Dict]] = None  # List of {"user_id": int, "deadline": str}

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code_content: Optional[str] = None
    classroom_ids: Optional[List[int]] = None
    submission_deadline: Optional[datetime] = None  # UTC datetime
    exclusions: Optional[List[Dict]] = None  # List of {"user_id": int, "deadline": str}

class ClassroomInfo(BaseModel):
    id: int
    name: str
    classroom_key: str

class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    code_content: str
    created_by: int
    creator_username: str
    classrooms: List[ClassroomInfo] = []
    created_at: datetime
    updated_at: datetime
    submission_deadline: Optional[datetime] = None
    exclusions: Optional[List[Dict]] = None
    can_submit: Optional[bool] = None  # Will be populated for user requests
    user_submission: Optional[Dict] = None  # Will be populated if user has submitted

    class Config:
        from_attributes = True

class TemplateListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    created_by: int
    creator_username: str
    classrooms: List[ClassroomInfo] = []
    created_at: datetime
    updated_at: datetime
    can_submit: Optional[bool] = None  # Whether user can submit to this template
    deadline_info: Optional[str] = None  # Deadline information if applicable

    class Config:
        from_attributes = True

class TemplateStatsResponse(BaseModel):
    total_templates: int
    recent_templates: int
    templates_by_language: List[dict]

class TemplateSubmitRequest(BaseModel):
    code_content: str
    execution_output: Optional[str] = None
    execution_status: str = "pending"
    execution_time: Optional[float] = None
    memory_used: Optional[int] = None
    error_message: Optional[str] = None

class TemplateSubmissionResponse(BaseModel):
    id: int
    template_id: int
    user_id: int
    submitted_code: str
    submitted_at: datetime
    output: Optional[str] = None
    status: str = "pending"
    language: Optional[str] = None
    execution_time: Optional[float] = None
    memory_used: Optional[int] = None
    error_message: Optional[str] = None
    submitted_by_username: Optional[str] = None
    template_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class UserInfo(BaseModel):
    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

# Template Draft Models
class TemplateDraftSaveRequest(BaseModel):
    code_content: str
    is_auto_save: Optional[bool] = False

class TemplateDraftResponse(BaseModel):
    id: int
    template_id: int
    user_id: int
    code_content: str
    is_auto_save: bool
    created_at: datetime
    updated_at: datetime
    template_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# Helper functions
def _prepare_template_response(template: Template) -> TemplateResponse:
    """Helper to prepare template response with classroom info"""
    # Build classroom info
    classroom_info = []
    for classroom in template.classrooms:
        classroom_info.append(ClassroomInfo(
            id=classroom.id,
            name=classroom.name,
            classroom_key=classroom.classroom_key
        ))
    
    # Create response object
    response_data = {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "language": template.language,
        "code_content": template.code_content,
        "created_by": template.created_by,
        "creator_username": getattr(template, 'creator_username', 'Unknown'),
        "classrooms": classroom_info,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "submission_deadline": template.submission_deadline,
        "exclusions": template.exclusions,
        "can_submit": getattr(template, 'can_submit', None),
        "user_submission": getattr(template, 'user_submission', None)
    }
    
    return TemplateResponse(**response_data)

def _prepare_template_list_response(template: Template) -> TemplateListResponse:
    """Helper to prepare template list response with classroom info"""
    # Build classroom info
    classroom_info = []
    for classroom in template.classrooms:
        classroom_info.append(ClassroomInfo(
            id=classroom.id,
            name=classroom.name,
            classroom_key=classroom.classroom_key
        ))
    
    # Create response object
    response_data = {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "language": template.language,
        "created_by": template.created_by,
        "creator_username": getattr(template, 'creator_username', 'Unknown'),
        "classrooms": classroom_info,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "can_submit": getattr(template, 'can_submit', None),
        "deadline_info": getattr(template, 'deadline_info', None)
    }
    
    return TemplateListResponse(**response_data)

async def get_admin_user(current_user: User = Depends(get_current_user)):
    """Verify user has admin access"""
    admin_service.verify_admin_access(current_user)
    return current_user


# Admin endpoints
@router.post("/admin/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template: TemplateCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Create a new template (Admin only)"""
    try:
        db_template = TemplateService.create_template(
            db=db,
            name=template.name,
            description=template.description,
            language=template.language,
            code_content=template.code_content,
            created_by=admin_user.id,
            classroom_ids=template.classroom_ids,
            submission_deadline=template.submission_deadline,
            exclusions=template.exclusions
        )
        
        # Add creator username and classroom info for response
        db_template.creator_username = admin_user.username
        return _prepare_template_response(db_template)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create template: {str(e)}"
        )

@router.get("/admin/templates", response_model=List[TemplateListResponse])
async def get_all_templates_admin(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all templates (Admin only)"""
    try:
        templates = TemplateService.get_all_templates(db, skip=skip, limit=limit)
        
        # Prepare response with creator usernames and classroom info
        result = []
        for template in templates:
            try:
                template.creator_username = template.creator.username if template.creator else "Unknown"
            except AttributeError:
                template.creator_username = "Unknown"
            
            result.append(_prepare_template_list_response(template))
        
        return result
    except Exception as e:
        # Return empty list if anything goes wrong
        return []

@router.get("/admin/templates/stats", response_model=TemplateStatsResponse)
async def get_template_stats(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get template statistics (Admin only)"""
    try:
        stats = TemplateService.get_template_stats(db)
        return stats
    except Exception as e:
        # Return safe default if anything goes wrong
        return {
            "total_templates": 0,
            "recent_templates": 0,
            "templates_by_language": []
        }

@router.get("/admin/templates/{template_id}", response_model=TemplateResponse)
async def get_template_admin(
    template_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get template by ID (Admin only)"""
    template = TemplateService.get_template_by_id(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    template.creator_username = template.creator.username
    return _prepare_template_response(template)

@router.put("/admin/templates/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    template: TemplateUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Update template (Admin only)"""
    try:
        updated_template = TemplateService.update_template(
            db=db,
            template_id=template_id,
            name=template.name,
            description=template.description,
            code_content=template.code_content,
            classroom_ids=template.classroom_ids,
            updating_user_id=admin_user.id,
            submission_deadline=template.submission_deadline,
            exclusions=template.exclusions
        )
        
        updated_template.creator_username = updated_template.creator.username
        return _prepare_template_response(updated_template)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update template: {str(e)}"
        )

@router.delete("/admin/templates/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Delete template (Admin only)"""
    try:
        success = TemplateService.delete_template(db, template_id, admin_user.id)
        if success:
            return {"message": "Template deleted successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete template"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete template: {str(e)}"
        )

@router.get("/admin/classrooms", response_model=List[ClassroomInfo])
async def get_available_classrooms(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get available classrooms where admin is a teacher for template assignment (Admin only)"""
    try:
        # Get classrooms where admin is a teacher (includes ones they created)
        classrooms = db.query(Classroom).join(UserClassroom).filter(
            Classroom.is_active == True,
            UserClassroom.user_id == admin_user.id,
            UserClassroom.is_active == True,
            UserClassroom.role == "TEACHER"
        ).order_by(Classroom.name).all()
        
        # Also include classrooms they created (in case they're not explicitly a member)
        created_classrooms = db.query(Classroom).filter(
            Classroom.is_active == True,
            Classroom.created_by_id == admin_user.id
        ).all()
        
        # Combine and deduplicate
        all_classrooms = {c.id: c for c in classrooms + created_classrooms}
        
        return [
            ClassroomInfo(
                id=classroom.id,
                name=classroom.name,
                classroom_key=classroom.classroom_key
            )
            for classroom in all_classrooms.values()
        ]
    except Exception as e:
        print(f"Error getting available classrooms: {e}")
        return []

@router.post("/admin/templates/upload", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_template_file(
    file: UploadFile = File(...),
    name: Optional[str] = None,
    description: Optional[str] = None,
    language: Optional[str] = None,
    classroom_ids: Optional[str] = None,  # JSON string of classroom IDs
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Upload a code file and create a template from it (Admin only)"""
    try:
        # Validate file size (max 1MB)
        if file.size and file.size > 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size too large. Maximum allowed size is 1MB."
            )
        
        # Read file content
        content = await file.read()
        
        # Decode content
        try:
            code_content = content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                code_content = content.decode('latin-1')
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File encoding not supported. Please upload a UTF-8 or Latin-1 encoded text file."
                )
        
        # Auto-detect language from file extension if not provided
        if not language and file.filename:
            extension = os.path.splitext(file.filename)[1].lower()
            language_map = {
                '.py': 'python',
                '.js': 'javascript',
                '.ts': 'typescript',
                '.java': 'java',
                '.cpp': 'cpp',
                '.c': 'cpp',
                '.h': 'cpp',
                '.go': 'go',
                '.rs': 'rust'
            }
            language = language_map.get(extension, 'python')  # Default to python
        
        # Use filename (without extension) as template name if not provided
        if not name and file.filename:
            name = os.path.splitext(file.filename)[0]
        
        # Validate required fields
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template name is required"
            )
        
        if not language:
            language = 'python'  # Default language
        
        # Parse classroom IDs if provided
        parsed_classroom_ids = None
        if classroom_ids:
            try:
                import json
                parsed_classroom_ids = json.loads(classroom_ids)
                if not isinstance(parsed_classroom_ids, list):
                    parsed_classroom_ids = None
            except (json.JSONDecodeError, ValueError):
                parsed_classroom_ids = None
        
        # Create template
        db_template = TemplateService.create_template(
            db=db,
            name=name,
            description=description or f"Uploaded from {file.filename}",
            language=language,
            code_content=code_content,
            created_by=admin_user.id,
            classroom_ids=parsed_classroom_ids
        )
        
        # Add creator username for response
        db_template.creator_username = admin_user.username
        return _prepare_template_response(db_template)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload template: {str(e)}"
        )


# User endpoints (for logged-in users)
@router.get("/templates", response_model=List[TemplateListResponse])
async def get_templates_for_users(
    language: Optional[str] = Query(None, description="Filter by programming language"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get templates for logged-in users based on their classroom memberships"""
    try:
        # Note: Returns ALL available templates (no limit), UI handles display pagination
        templates = TemplateService.get_templates_for_user(
            db=db, 
            user_id=current_user.id,
            language=language
        )
        
        # Prepare response with creator usernames, classroom info, and submission status
        result = []
        for template in templates:
            try:
                template.creator_username = template.creator.username if template.creator else "Unknown"
            except AttributeError:
                template.creator_username = "Unknown"
            
            # Check if user can submit to this template
            can_submit, deadline_info = TemplateService.can_user_submit(db, template.id, current_user.id)
            template.can_submit = can_submit
            template.deadline_info = deadline_info
            
            result.append(_prepare_template_list_response(template))
        
        return result
    except Exception as e:
        # Return empty list if anything goes wrong
        return []

@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template_for_user(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get specific template for logged-in users (with classroom access check)"""
    template = TemplateService.get_template_by_id(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Check if user has access to this template
    if template.classrooms:  # If template has classroom restrictions
        user_classroom_ids = [
            membership.classroom_id 
            for membership in current_user.classroom_memberships 
            if membership.is_active
        ]
        template_classroom_ids = [classroom.id for classroom in template.classrooms]
        
        # Check if user is in any of the template's classrooms
        if not any(classroom_id in user_classroom_ids for classroom_id in template_classroom_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this template"
            )
    
    # Add submission information for user
    can_submit, _ = TemplateService.can_user_submit(db, template_id, current_user.id)
    user_submission = TemplateService.get_user_submission(db, template_id, current_user.id)
    
    template.creator_username = template.creator.username
    template.can_submit = can_submit
    template.user_submission = {
        "id": user_submission.id,
        "submitted_at": user_submission.submitted_at
    } if user_submission else None
    
    return _prepare_template_response(template)


@router.post("/templates/{template_id}/submit", response_model=TemplateSubmissionResponse)
async def submit_template(
    template_id: int,
    request: TemplateSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submit code for a template with execution results"""
    try:
        submission = TemplateService.submit_template(
            db=db,
            template_id=template_id,
            user_id=current_user.id,
            submitted_code=request.code_content,
            execution_output=request.execution_output,
            execution_status=request.execution_status,
            execution_time=request.execution_time,
            memory_used=request.memory_used,
            error_message=request.error_message
        )
        return submission
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit template: {str(e)}"
        )


@router.get("/templates/{template_id}/can-submit")
async def can_submit_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if user can submit template"""
    try:
        can_submit, deadline_info = TemplateService.can_user_submit(db, template_id, current_user.id)
        return {
            "can_submit": can_submit,
            "deadline_info": deadline_info
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check submission status: {str(e)}"
        )


@router.get("/my-submissions", response_model=List[TemplateSubmissionResponse])
async def get_my_submissions(
    template_name: Optional[str] = Query(None, description="Filter by template name"),
    language: Optional[str] = Query(None, description="Filter by language"),
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's template submissions only"""
    try:
        submissions = TemplateService.get_template_submissions(
            db=db,
            user_id=current_user.id,  # Only return current user's submissions
            status=status,
            language=language,
            skip=skip,
            limit=limit
        )
        
        # Filter by template name if provided
        if template_name:
            submissions = [s for s in submissions if s.template_name and template_name.lower() in s.template_name.lower()]
        
        return submissions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user submissions: {str(e)}"
        )


@router.get("/my-submissions/stats")
async def get_my_submissions_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's submission statistics"""
    try:
        stats = TemplateService.get_user_submissions_stats(db, current_user.id)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user submission stats: {str(e)}"
        )


@router.get("/admin/classrooms/{classroom_id}/users", response_model=List[UserInfo])
async def get_classroom_users(
    classroom_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all users in a classroom for exclusion list (Admin only)"""
    try:
        # First verify that the admin has access to this classroom (either as creator or member)
        # Check if classroom exists and is active
        classroom = db.query(Classroom).filter(
            Classroom.id == classroom_id,
            Classroom.is_active == True
        ).first()
        
        if not classroom:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Classroom not found"
            )
        
        # Check if admin has access to this classroom (either created it or is a member)
        has_access = False
        
        # Check if admin created the classroom
        if classroom.created_by_id == admin_user.id:
            has_access = True
        else:
            # Check if admin is a member of the classroom
            admin_membership = db.query(UserClassroom).filter(
                UserClassroom.user_id == admin_user.id,
                UserClassroom.classroom_id == classroom_id,
                UserClassroom.is_active == True
            ).first()
            
            if admin_membership:
                has_access = True
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - you are not a member of this classroom"
            )
        
        # Get classroom members
        user_classrooms = db.query(UserClassroom).filter(
            UserClassroom.classroom_id == classroom_id,
            UserClassroom.is_active == True
        ).all()
        
        # Get user information
        user_ids = [uc.user_id for uc in user_classrooms]
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        
        return [
            UserInfo(
                id=user.id,
                username=user.username,
                first_name=user.full_name.split(' ', 1)[0] if user.full_name else None,
                last_name=user.full_name.split(' ', 1)[1] if user.full_name and len(user.full_name.split(' ', 1)) > 1 else None
            )
            for user in users
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get classroom users: {str(e)}"
        )


@router.get("/admin/submissions", response_model=List[TemplateSubmissionResponse])
async def get_all_submissions(
    template_name: Optional[str] = Query(None, description="Filter by template name"),
    user: Optional[str] = Query(None, description="Filter by username"),
    language: Optional[str] = Query(None, description="Filter by language"), 
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all template submissions with filters (Admin only)"""
    try:
        # Convert user filter to user_id if provided
        user_id = None
        if user:
            from app.models.user import User as UserModel
            user_obj = db.query(UserModel).filter(UserModel.username == user).first()
            user_id = user_obj.id if user_obj else -1  # Use -1 to return no results if user not found
        
        submissions = TemplateService.get_template_submissions(
            db=db,
            user_id=user_id,
            status=status,
            language=language,
            skip=skip,
            limit=limit
        )
        
        # Filter by template name if provided (since we can't easily do this in SQL with current structure)
        if template_name:
            submissions = [s for s in submissions if s.template_name and template_name.lower() in s.template_name.lower()]
        
        return submissions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get submissions: {str(e)}"
        )

@router.get("/admin/submissions/stats")
async def get_submissions_stats(
    template_id: Optional[int] = Query(None, description="Filter stats by template ID"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get submission statistics (Admin only)"""
    try:
        stats = TemplateService.get_submissions_stats(db, template_id)
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get submission stats: {str(e)}"
        )

@router.get("/admin/templates/{template_id}/submissions", response_model=List[TemplateSubmissionResponse])
async def get_template_submissions(
    template_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Get all submissions for a specific template (Admin only)"""
    try:
        submissions = TemplateService.get_template_submissions(
            db=db, 
            template_id=template_id,
            skip=skip,
            limit=limit
        )
        return submissions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get template submissions: {str(e)}"
        )


# User Template Endpoints (Personal Templates)

class UserTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: str
    code_content: str

class UserTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code_content: Optional[str] = None

class UserTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    code_content: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class UserTemplateListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


@router.post("/user-templates", response_model=UserTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_user_template(
    template: UserTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new personal template for the current user"""
    try:
        new_template = UserTemplateService.create_user_template(
            db=db,
            name=template.name,
            description=template.description,
            language=template.language,
            code_content=template.code_content,
            user_id=current_user.id
        )
        return new_template
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create template: {str(e)}"
        )


@router.get("/user-templates", response_model=List[UserTemplateListResponse])
async def get_user_templates(
    language: Optional[str] = Query(None, description="Filter by programming language"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all personal templates for the current user"""
    try:
        if language:
            templates = UserTemplateService.get_user_templates_by_language(db, current_user.id, language)
        else:
            templates = UserTemplateService.get_all_user_templates(db, current_user.id)
        
        return templates
    except Exception as e:
        # Return empty list if anything goes wrong
        return []


@router.get("/user-templates/{template_id}", response_model=UserTemplateResponse)
async def get_user_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific personal template"""
    template = UserTemplateService.get_user_template_by_id(db, template_id, current_user.id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template


@router.put("/user-templates/{template_id}", response_model=UserTemplateResponse)
async def update_user_template(
    template_id: int,
    template_update: UserTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a personal template"""
    try:
        updated_template = UserTemplateService.update_user_template(
            db=db,
            template_id=template_id,
            user_id=current_user.id,
            name=template_update.name,
            description=template_update.description,
            code_content=template_update.code_content
        )
        return updated_template
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update template: {str(e)}"
        )


@router.delete("/user-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a personal template"""
    try:
        UserTemplateService.delete_user_template(db, template_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete template: {str(e)}"
        )


class RerunSubmissionResponse(BaseModel):
    success: bool
    message: str
    output: Optional[str] = None
    error_message: Optional[str] = None
    execution_time: Optional[float] = None
    status: str


@router.post("/admin/submissions/{submission_id}/rerun", response_model=RerunSubmissionResponse)
async def rerun_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    """Re-run a specific submission and update its output (Admin only)"""
    try:
        # Get the submission
        submission = db.query(TemplateSubmission).filter(
            TemplateSubmission.id == submission_id
        ).first()
        
        if not submission:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )
        
        # Verify admin has access to this submission (same pattern as analytics service)
        if submission.template:
            # Get classrooms where admin is a teacher (includes ones they created)
            teacher_classrooms = db.query(Classroom).join(UserClassroom).filter(
                Classroom.is_active == True,
                UserClassroom.user_id == admin_user.id,
                UserClassroom.is_active == True,
                UserClassroom.role == "TEACHER"
            ).all()
            
            # Also include classrooms they created (in case they're not explicitly a member)
            created_classrooms = db.query(Classroom).filter(
                Classroom.is_active == True,
                Classroom.created_by_id == admin_user.id
            ).all()
            
            # Combine and deduplicate
            all_classrooms_dict = {c.id: c for c in teacher_classrooms + created_classrooms}
            admin_classroom_ids = list(all_classrooms_dict.keys())
            
            # Check if template is assigned to any of admin's accessible classrooms
            template_classrooms = [c.id for c in submission.template.classrooms]
            
            if not any(classroom_id in admin_classroom_ids for classroom_id in template_classrooms):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You don't have access to this submission"
                )
        
        # Execute the code and measure execution time
        start_time = time.time()
        
        execution_result = await code_execution_service.execute_code(
            code=submission.submitted_code,
            language=submission.language or "python",
            input_data=""
        )
        
        end_time = time.time()
        actual_execution_time = round(end_time - start_time, 3)
        
        # Update the submission with new execution results
        submission.output = execution_result.get("output", "")
        submission.error_message = execution_result.get("error", "")
        submission.execution_time = actual_execution_time
        # The microservice returns status: "success", "error", or "timeout"
        submission.status = execution_result.get("status", "error")
        
        # Save changes
        db.commit()
        
        return RerunSubmissionResponse(
            success=True,
            message="Submission re-run successfully",
            output=submission.output,
            error_message=submission.error_message,
            execution_time=submission.execution_time,
            status=submission.status
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to re-run submission: {str(e)}"
        )


# Template Draft Endpoints

@router.post("/templates/{template_id}/save-draft", response_model=TemplateDraftResponse)
async def save_template_draft(
    template_id: int,
    request: TemplateDraftSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save a draft of template progress"""
    try:
        draft = TemplateService.save_template_draft(
            db=db,
            template_id=template_id,
            user_id=current_user.id,
            code_content=request.code_content,
            is_auto_save=request.is_auto_save
        )
        
        # Add template name for response
        template = db.query(Template).filter(Template.id == template_id).first()
        draft_response = TemplateDraftResponse(
            id=draft.id,
            template_id=draft.template_id,
            user_id=draft.user_id,
            code_content=draft.code_content,
            is_auto_save=draft.is_auto_save,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
            template_name=template.name if template else None
        )
        
        return draft_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save draft: {str(e)}"
        )

@router.get("/templates/{template_id}/draft", response_model=Optional[TemplateDraftResponse])
async def get_template_draft(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get saved draft for a template"""
    try:
        draft = TemplateService.get_template_draft(
            db=db,
            template_id=template_id,
            user_id=current_user.id
        )
        
        if not draft:
            return None
        
        # Add template name for response
        template = db.query(Template).filter(Template.id == template_id).first()
        return TemplateDraftResponse(
            id=draft.id,
            template_id=draft.template_id,
            user_id=draft.user_id,
            code_content=draft.code_content,
            is_auto_save=draft.is_auto_save,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
            template_name=template.name if template else None
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get draft: {str(e)}"
        )

@router.delete("/templates/{template_id}/draft")
async def delete_template_draft(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete saved draft for a template"""
    try:
        success = TemplateService.delete_template_draft(
            db=db,
            template_id=template_id,
            user_id=current_user.id
        )
        
        if success:
            return {"message": "Draft deleted successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Draft not found"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete draft: {str(e)}"
        )

@router.get("/my-drafts", response_model=List[TemplateDraftResponse])
async def get_user_drafts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all drafts for the current user"""
    try:
        drafts = TemplateService.get_user_drafts(
            db=db,
            user_id=current_user.id,
            skip=skip,
            limit=limit
        )
        
        # Prepare response with template names
        result = []
        for draft in drafts:
            template = db.query(Template).filter(Template.id == draft.template_id).first()
            result.append(TemplateDraftResponse(
                id=draft.id,
                template_id=draft.template_id,
                user_id=draft.user_id,
                code_content=draft.code_content,
                is_auto_save=draft.is_auto_save,
                created_at=draft.created_at,
                updated_at=draft.updated_at,
                template_name=template.name if template else None
            ))
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user drafts: {str(e)}"
        )

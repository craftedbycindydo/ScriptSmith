from fastapi import APIRouter, HTTPException, Depends, Query, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import os

from app.database.base import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.template import Template
from app.models.user_template import UserTemplate
from app.services.template_service import TemplateService
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

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code_content: Optional[str] = None

class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    code_content: str
    created_by: int
    creator_username: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TemplateListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    language: str
    created_by: int
    creator_username: str
    created_at: datetime

    class Config:
        from_attributes = True

class TemplateStatsResponse(BaseModel):
    total_templates: int
    recent_templates: int
    templates_by_language: List[dict]


# Helper function to check admin access
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
            created_by=admin_user.id
        )
        
        # Add creator username for response
        db_template.creator_username = admin_user.username
        return db_template
        
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
        
        # Add creator usernames safely
        for template in templates:
            try:
                template.creator_username = template.creator.username if template.creator else "Unknown"
            except AttributeError:
                template.creator_username = "Unknown"
        
        return templates
    except Exception as e:
        # Return empty list if anything goes wrong
        return []

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
    return template

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
            updating_user_id=admin_user.id
        )
        
        updated_template.creator_username = updated_template.creator.username
        return updated_template
        
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

@router.post("/admin/templates/upload", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_template_file(
    file: UploadFile = File(...),
    name: Optional[str] = None,
    description: Optional[str] = None,
    language: Optional[str] = None,
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
        
        # Create template
        db_template = TemplateService.create_template(
            db=db,
            name=name,
            description=description or f"Uploaded from {file.filename}",
            language=language,
            code_content=code_content,
            created_by=admin_user.id
        )
        
        # Add creator username for response
        db_template.creator_username = admin_user.username
        return db_template
        
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
    """Get templates for logged-in users"""
    try:
        if language:
            templates = TemplateService.get_templates_by_language(db, language)
        else:
            templates = TemplateService.get_all_templates(db)
        
        # Add creator usernames safely
        for template in templates:
            try:
                template.creator_username = template.creator.username if template.creator else "Unknown"
            except AttributeError:
                template.creator_username = "Unknown"
        
        return templates
    except Exception as e:
        # Return empty list if anything goes wrong
        return []

@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template_for_user(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get specific template for logged-in users"""
    template = TemplateService.get_template_by_id(db, template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    template.creator_username = template.creator.username
    return template


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

"""
User Template Service - Business logic for managing user's personal code templates
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user_template import UserTemplate
from app.models.user import User


class UserTemplateService:
    """Service for managing user's personal code templates"""
    
    @staticmethod
    def create_user_template(
        db: Session,
        name: str,
        description: Optional[str],
        language: str,
        code_content: str,
        user_id: int
    ) -> UserTemplate:
        """Create a new user template"""
        
        # Check if template name already exists for this user and language
        existing = db.query(UserTemplate).filter(
            UserTemplate.name == name,
            UserTemplate.language == language,
            UserTemplate.user_id == user_id,
            UserTemplate.is_active == True
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template '{name}' already exists for {language}"
            )
        
        template = UserTemplate(
            name=name,
            description=description,
            language=language,
            code_content=code_content,
            user_id=user_id
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        
        return template
    
    @staticmethod
    def get_user_template_by_id(db: Session, template_id: int, user_id: int) -> Optional[UserTemplate]:
        """Get user template by ID (only if it belongs to the user)"""
        return db.query(UserTemplate).filter(
            UserTemplate.id == template_id,
            UserTemplate.user_id == user_id,
            UserTemplate.is_active == True
        ).first()
    
    @staticmethod
    def get_user_templates_by_language(db: Session, user_id: int, language: str) -> List[UserTemplate]:
        """Get all user templates for a specific language"""
        return db.query(UserTemplate).filter(
            UserTemplate.user_id == user_id,
            UserTemplate.language == language,
            UserTemplate.is_active == True
        ).order_by(UserTemplate.created_at.desc()).all()
    
    @staticmethod
    def get_all_user_templates(db: Session, user_id: int) -> List[UserTemplate]:
        """Get all templates for a specific user"""
        return db.query(UserTemplate).filter(
            UserTemplate.user_id == user_id,
            UserTemplate.is_active == True
        ).order_by(UserTemplate.created_at.desc()).all()
    
    @staticmethod
    def update_user_template(
        db: Session,
        template_id: int,
        user_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        code_content: Optional[str] = None
    ) -> Optional[UserTemplate]:
        """Update an existing user template"""
        
        template = UserTemplateService.get_user_template_by_id(db, template_id, user_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Check for name conflicts if name is being updated
        if name and name != template.name:
            existing = db.query(UserTemplate).filter(
                UserTemplate.name == name,
                UserTemplate.language == template.language,
                UserTemplate.user_id == user_id,
                UserTemplate.id != template_id,
                UserTemplate.is_active == True
            ).first()
            
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Template '{name}' already exists for {template.language}"
                )
        
        # Update fields
        if name is not None:
            template.name = name
        if description is not None:
            template.description = description
        if code_content is not None:
            template.code_content = code_content
        
        db.commit()
        db.refresh(template)
        
        return template
    
    @staticmethod
    def delete_user_template(db: Session, template_id: int, user_id: int) -> bool:
        """Delete a user template (soft delete)"""
        
        template = UserTemplateService.get_user_template_by_id(db, template_id, user_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        template.is_active = False
        db.commit()
        
        return True

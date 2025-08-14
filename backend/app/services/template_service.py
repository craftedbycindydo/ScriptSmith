"""
Template Service - Business logic for managing code templates
"""

from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.template import Template
from app.models.user import User


class TemplateService:
    """Service for managing code templates"""
    
    @staticmethod
    def create_template(
        db: Session,
        name: str,
        description: Optional[str],
        language: str,
        code_content: str,
        created_by: int
    ) -> Template:
        """Create a new template"""
        
        # Check if template name already exists for this language
        existing = db.query(Template).filter(
            Template.name == name,
            Template.language == language,
            Template.is_active == True
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template '{name}' already exists for {language}"
            )
        
        template = Template(
            name=name,
            description=description,
            language=language,
            code_content=code_content,
            created_by=created_by
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        
        return template
    
    @staticmethod
    def get_template_by_id(db: Session, template_id: int) -> Optional[Template]:
        """Get template by ID"""
        return db.query(Template).filter(
            Template.id == template_id,
            Template.is_active == True
        ).first()
    
    @staticmethod
    def get_templates_by_language(db: Session, language: str) -> List[Template]:
        """Get all active templates for a specific language"""
        try:
            return db.query(Template).filter(
                Template.language == language,
                Template.is_active == True
            ).order_by(Template.name).all()
        except Exception as e:
            print(f"Error getting templates for language {language}: {str(e)}")
            return []
    
    @staticmethod
    def get_all_templates(db: Session, skip: int = 0, limit: int = 100) -> List[Template]:
        """Get all active templates with pagination"""
        try:
            return db.query(Template).filter(
                Template.is_active == True
            ).order_by(Template.language, Template.name).offset(skip).limit(limit).all()
        except Exception as e:
            print(f"Error getting templates: {str(e)}")
            return []
    
    @staticmethod
    def get_templates_by_creator(db: Session, creator_id: int) -> List[Template]:
        """Get all templates created by a specific user"""
        return db.query(Template).filter(
            Template.created_by == creator_id,
            Template.is_active == True
        ).order_by(Template.created_at.desc()).all()
    
    @staticmethod
    def update_template(
        db: Session,
        template_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        code_content: Optional[str] = None,
        updating_user_id: int = None
    ) -> Template:
        """Update an existing template"""
        
        template = TemplateService.get_template_by_id(db, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Only allow admin or template creator to update
        if updating_user_id and template.created_by != updating_user_id:
            user = db.query(User).filter(User.id == updating_user_id).first()
            if not user or not user.is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only template creator or admin can update template"
                )
        
        # Check for name conflicts if name is being updated
        if name and name != template.name:
            existing = db.query(Template).filter(
                Template.name == name,
                Template.language == template.language,
                Template.id != template_id,
                Template.is_active == True
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
    def delete_template(db: Session, template_id: int, deleting_user_id: int) -> bool:
        """Soft delete a template"""
        
        template = TemplateService.get_template_by_id(db, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Only allow admin or template creator to delete
        if template.created_by != deleting_user_id:
            user = db.query(User).filter(User.id == deleting_user_id).first()
            if not user or not user.is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only template creator or admin can delete template"
                )
        
        template.is_active = False
        db.commit()
        
        return True
    
    @staticmethod
    def get_template_stats(db: Session) -> Dict:
        """Get template statistics for admin dashboard"""
        try:
            total_templates = db.query(Template).filter(Template.is_active == True).count()
            
            # Templates by language
            language_stats = db.query(
                Template.language,
                func.count(Template.id).label('count')
            ).filter(
                Template.is_active == True
            ).group_by(Template.language).all()
            
            # Recent templates (last 7 days)
            from datetime import datetime, timedelta
            recent_date = datetime.utcnow() - timedelta(days=7)
            recent_templates = db.query(Template).filter(
                Template.created_at >= recent_date,
                Template.is_active == True
            ).count()
            
            return {
                "total_templates": total_templates,
                "recent_templates": recent_templates,
                "templates_by_language": [
                    {"language": lang, "count": count} 
                    for lang, count in language_stats
                ]
            }
        except Exception as e:
            # Return safe default values if database query fails
            print(f"Error getting template stats: {str(e)}")
            return {
                "total_templates": 0,
                "recent_templates": 0,
                "templates_by_language": []
            }

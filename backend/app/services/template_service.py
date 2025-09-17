"""
Template Service - Business logic for managing code templates
"""

from typing import List, Optional, Dict
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from fastapi import HTTPException, status
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.models.user import User
from app.models.classroom import Classroom, UserClassroom


class TemplateService:
    """Service for managing code templates"""
    
    @staticmethod
    def create_template(
        db: Session,
        name: str,
        description: Optional[str],
        language: str,
        code_content: str,
        created_by: int,
        classroom_ids: Optional[List[int]] = None,
        submission_deadline: Optional[datetime] = None,
        exclusions: Optional[List[Dict]] = None
    ) -> Template:
        """Create a new template with optional classroom associations"""
        
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
        
        # Enrich exclusions with usernames if provided
        enriched_exclusions = None
        if exclusions:
            enriched_exclusions = []
            for exclusion in exclusions:
                enriched_exclusion = exclusion.copy()
                # Ensure username is present for each exclusion
                if 'username' not in enriched_exclusion or not enriched_exclusion['username']:
                    user = db.query(User).filter(User.id == exclusion['user_id']).first()
                    if user:
                        enriched_exclusion['username'] = user.username
                    else:
                        enriched_exclusion['username'] = f"User {exclusion['user_id']}"
                enriched_exclusions.append(enriched_exclusion)
        
        template = Template(
            name=name,
            description=description,
            language=language,
            code_content=code_content,
            created_by=created_by,
            submission_deadline=submission_deadline,
            exclusions=enriched_exclusions
        )
        
        db.add(template)
        db.flush()  # Get the template ID
        
        # Associate with classrooms if specified (only classrooms where admin is a member/teacher)
        if classroom_ids:
            # Check which classrooms the admin has access to
            accessible_classrooms = db.query(Classroom).join(UserClassroom).filter(
                Classroom.id.in_(classroom_ids),
                Classroom.is_active == True,
                UserClassroom.user_id == created_by,
                UserClassroom.is_active == True,
                UserClassroom.role == "TEACHER"  # Admin must be a teacher in the classroom
            ).all()
            
            # If admin created the classroom, they should also have access even if not explicitly a member
            created_classrooms = db.query(Classroom).filter(
                Classroom.id.in_(classroom_ids),
                Classroom.is_active == True,
                Classroom.created_by_id == created_by
            ).all()
            
            # Combine both sets of accessible classrooms
            all_accessible = {c.id: c for c in accessible_classrooms + created_classrooms}
            template.classrooms = list(all_accessible.values())
        
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
        """Get all active templates with pagination (Admin only)"""
        try:
            return db.query(Template).filter(
                Template.is_active == True
            ).order_by(Template.language, Template.name).offset(skip).limit(limit).all()
        except Exception as e:
            print(f"Error getting templates: {str(e)}")
            return []
    
    @staticmethod
    def get_templates_for_user(
        db: Session, 
        user_id: int, 
        language: Optional[str] = None,
        skip: int = 0, 
        limit: int = None  # No limit - return ALL templates, UI will handle display
    ) -> List[Template]:
        """Get templates accessible to a specific user based on their classroom memberships"""
        try:
            # Get user's classroom IDs
            user_classroom_ids = db.query(UserClassroom.classroom_id).filter(
                UserClassroom.user_id == user_id,
                UserClassroom.is_active == True
            ).all()
            
            user_classroom_ids = [row[0] for row in user_classroom_ids]
            
            # Use simple ORM approach to completely avoid DISTINCT and JSON issues
            if user_classroom_ids:
                # Get all templates that match criteria - separate queries to avoid complex joins
                
                # 1. Get global templates (no classroom associations) 
                from app.models.template import template_classroom_association
                from sqlalchemy import exists
                
                global_templates = db.query(Template).filter(
                    Template.is_active == True,
                    ~exists().where(template_classroom_association.c.template_id == Template.id)
                ).all()
                
                # 2. Get classroom-specific templates 
                classroom_templates = db.query(Template).join(
                    template_classroom_association,
                    Template.id == template_classroom_association.c.template_id
                ).filter(
                    Template.is_active == True,
                    template_classroom_association.c.classroom_id.in_(user_classroom_ids)
                ).all()
                
                # 3. Combine and deduplicate manually (safe approach)
                all_templates = {}
                for template in global_templates + classroom_templates:
                    all_templates[template.id] = template
                
                templates = list(all_templates.values())
                
                # 4. Apply language filter
                if language:
                    templates = [t for t in templates if t.language == language]
                
                # 5. Sort by updated_at desc (most recently updated first), then created_at desc as fallback
                templates.sort(key=lambda t: (t.updated_at or t.created_at, t.created_at), reverse=True)
                
                # 6. Apply pagination only if limit is specified
                if limit is not None:
                    return templates[skip:skip + limit]
                else:
                    return templates[skip:]
                
            else:
                # User not in any classroom - only global templates
                from app.models.template import template_classroom_association
                from sqlalchemy import exists
                
                templates = db.query(Template).filter(
                    Template.is_active == True,
                    ~exists().where(template_classroom_association.c.template_id == Template.id)
                ).all()
                
                if language:
                    templates = [t for t in templates if t.language == language]
                
                # Sort by updated_at desc (most recently updated first), then created_at desc as fallback
                templates.sort(key=lambda t: (t.updated_at or t.created_at, t.created_at), reverse=True)
                
                # Apply pagination only if limit is specified
                if limit is not None:
                    return templates[skip:skip + limit]
                else:
                    return templates[skip:]
            
        except Exception as e:
            print(f"Error getting templates for user {user_id}: {str(e)}")
            import traceback
            traceback.print_exc()
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
        classroom_ids: Optional[List[int]] = None,
        updating_user_id: int = None,
        submission_deadline: Optional[datetime] = None,
        exclusions: Optional[List[Dict]] = None
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
        if submission_deadline is not None:
            template.submission_deadline = submission_deadline
        if exclusions is not None:
            # Enrich exclusions with usernames if not already present
            enriched_exclusions = []
            for exclusion in exclusions:
                enriched_exclusion = exclusion.copy()
                # Ensure username is present for each exclusion
                if 'username' not in enriched_exclusion or not enriched_exclusion['username']:
                    user = db.query(User).filter(User.id == exclusion['user_id']).first()
                    if user:
                        enriched_exclusion['username'] = user.username
                    else:
                        enriched_exclusion['username'] = f"User {exclusion['user_id']}"
                enriched_exclusions.append(enriched_exclusion)
            template.exclusions = enriched_exclusions
        
        # Update classroom associations if specified (only classrooms where admin is a member/teacher)
        if classroom_ids is not None:
            if classroom_ids:
                # Check which classrooms the admin has access to
                accessible_classrooms = db.query(Classroom).join(UserClassroom).filter(
                    Classroom.id.in_(classroom_ids),
                    Classroom.is_active == True,
                    UserClassroom.user_id == updating_user_id,
                    UserClassroom.is_active == True,
                    UserClassroom.role == "TEACHER"  # Admin must be a teacher in the classroom
                ).all()
                
                # If admin created the classroom, they should also have access even if not explicitly a member
                created_classrooms = db.query(Classroom).filter(
                    Classroom.id.in_(classroom_ids),
                    Classroom.is_active == True,
                    Classroom.created_by_id == updating_user_id
                ).all()
                
                # Combine both sets of accessible classrooms
                all_accessible = {c.id: c for c in accessible_classrooms + created_classrooms}
                template.classrooms = list(all_accessible.values())
            else:
                # Clear all classroom associations (make it global)
                template.classrooms = []
        
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
    
    @staticmethod
    def submit_template(
        db: Session,
        template_id: int,
        user_id: int,
        submitted_code: str,
        execution_output: str = None,
        execution_status: str = "pending",
        language: str = None,
        execution_time: float = None,
        memory_used: int = None,
        error_message: str = None
    ) -> TemplateSubmission:
        """Submit code for a template with execution results"""
        
        # Check if template exists and is active
        template = TemplateService.get_template_by_id(db, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Get user details
        from app.models.user import User
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Check if user can submit (deadline and exclusions)
        can_submit, deadline_info = TemplateService.can_user_submit(db, template_id, user_id)
        if not can_submit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Submission deadline has passed. Deadline was: {deadline_info}"
            )
        
        # Check if user has already submitted
        existing_submission = db.query(TemplateSubmission).filter(
            TemplateSubmission.template_id == template_id,
            TemplateSubmission.user_id == user_id
        ).first()
        
        # Check if user has already submitted
        if existing_submission:
            # Check if user has an exclusion that allows one resubmission
            user_has_exclusion = False
            if template.exclusions:
                for exclusion in template.exclusions:
                    if exclusion.get("user_id") == user_id:
                        user_has_exclusion = True
                        break
            
            if not user_has_exclusion:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You have already submitted this template"
                )
            
            # User has exclusion - check if they've already resubmitted once
            if existing_submission.resubmission_count >= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You have already used your one allowed resubmission for this template"
                )
            
            # Allow the resubmission - update the existing submission and increment resubmission count
            existing_submission.submitted_code = submitted_code
            existing_submission.output = execution_output
            existing_submission.status = execution_status
            existing_submission.language = language or template.language
            existing_submission.execution_time = execution_time
            existing_submission.memory_used = memory_used
            existing_submission.error_message = error_message
            existing_submission.submitted_at = datetime.now(timezone.utc)
            existing_submission.resubmission_count += 1  # Increment resubmission count
            db.commit()
            db.refresh(existing_submission)
            return existing_submission
        
        # Create the submission with execution details
        submission = TemplateSubmission(
            template_id=template_id,
            user_id=user_id,
            submitted_code=submitted_code,
            output=execution_output,
            status=execution_status,
            language=language or template.language,
            execution_time=execution_time,
            memory_used=memory_used,
            error_message=error_message,
            submitted_by_username=user.username,
            template_name=template.name
        )
        
        db.add(submission)
        db.commit()
        db.refresh(submission)
        
        return submission
    
    @staticmethod
    def can_user_submit(db: Session, template_id: int, user_id: int) -> tuple[bool, Optional[str]]:
        """Check if user can submit for a template based on deadline, exclusions, and resubmission limits"""
        
        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            return False, None
        
        current_time = datetime.now(timezone.utc)
        
        # Check if user has already submitted
        existing_submission = db.query(TemplateSubmission).filter(
            TemplateSubmission.template_id == template_id,
            TemplateSubmission.user_id == user_id
        ).first()
        
        # Check if user has an exclusion
        user_has_exclusion = False
        custom_deadline_str = None
        if template.exclusions:
            for exclusion in template.exclusions:
                if exclusion.get("user_id") == user_id:
                    user_has_exclusion = True
                    custom_deadline_str = exclusion.get("deadline")
                    break
        
        # If user has already submitted
        if existing_submission:
            # If user doesn't have exclusion, they can't submit again
            if not user_has_exclusion:
                return False, None
            
            # If user has exclusion but already used their one resubmission
            if existing_submission.resubmission_count >= 1:
                return False, custom_deadline_str
            
            # User has exclusion and hasn't used resubmission yet - check deadline
            if custom_deadline_str:
                try:
                    custom_deadline = datetime.fromisoformat(custom_deadline_str.replace('Z', '+00:00'))
                    if current_time <= custom_deadline:
                        return True, custom_deadline_str
                    else:
                        return False, custom_deadline_str
                except ValueError:
                    return False, custom_deadline_str
        
        # User hasn't submitted yet - check deadlines
        # Check for user-specific exclusion with custom deadline
        if user_has_exclusion and custom_deadline_str:
            try:
                custom_deadline = datetime.fromisoformat(custom_deadline_str.replace('Z', '+00:00'))
                if current_time <= custom_deadline:
                    return True, custom_deadline_str
                else:
                    return False, custom_deadline_str
            except ValueError:
                pass  # Invalid date format, fall through to general deadline
        
        # Check general submission deadline
        if template.submission_deadline:
            # Make template deadline timezone-aware if it's naive
            template_deadline = template.submission_deadline
            if template_deadline.tzinfo is None:
                template_deadline = template_deadline.replace(tzinfo=timezone.utc)
            
            if current_time <= template_deadline:
                return True, template.submission_deadline.isoformat()
            else:
                return False, template.submission_deadline.isoformat()
        
        # No deadline set, always allow submission
        return True, None
    
    @staticmethod
    def get_user_submission(db: Session, template_id: int, user_id: int) -> Optional[TemplateSubmission]:
        """Get user's submission for a specific template"""
        return db.query(TemplateSubmission).filter(
            TemplateSubmission.template_id == template_id,
            TemplateSubmission.user_id == user_id
        ).first()
    
    @staticmethod
    def get_template_submissions(
        db: Session, 
        template_id: int = None,
        user_id: int = None,
        status: str = None,
        language: str = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[TemplateSubmission]:
        """Get submissions with filters (similar to executions)"""
        query = db.query(TemplateSubmission)
        
        if template_id is not None:
            query = query.filter(TemplateSubmission.template_id == template_id)
        
        if user_id is not None:
            query = query.filter(TemplateSubmission.user_id == user_id)
        
        if status:
            query = query.filter(TemplateSubmission.status == status)
            
        if language:
            query = query.filter(TemplateSubmission.language == language)
        
        return query.order_by(desc(TemplateSubmission.submitted_at)).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_submissions_stats(db: Session, template_id: int = None) -> dict:
        """Get submission statistics"""
        query = db.query(TemplateSubmission)
        
        if template_id is not None:
            query = query.filter(TemplateSubmission.template_id == template_id)
        
        total_submissions = query.count()
        success_submissions = query.filter(TemplateSubmission.status == "success").count()
        error_submissions = query.filter(TemplateSubmission.status == "error").count()
        
        # Get submissions by language
        language_stats = db.query(
            TemplateSubmission.language,
            func.count(TemplateSubmission.id).label('count')
        )
        
        if template_id is not None:
            language_stats = language_stats.filter(TemplateSubmission.template_id == template_id)
        
        language_stats = language_stats.group_by(TemplateSubmission.language).all()
        
        return {
            "total_submissions": total_submissions,
            "success_submissions": success_submissions,
            "error_submissions": error_submissions,
            "success_rate": round((success_submissions / total_submissions * 100), 2) if total_submissions > 0 else 0,
            "submissions_by_language": [
                {"language": lang, "count": count} for lang, count in language_stats
            ]
        }
    
    # Template Draft Methods
    
    @staticmethod
    def save_template_draft(
        db: Session,
        template_id: int,
        user_id: int,
        code_content: str,
        is_auto_save: bool = False
    ) -> TemplateDraft:
        """Save or update a template draft for a user"""
        
        # Check if template exists and user has access
        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Check if draft already exists
        existing_draft = db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
        
        if existing_draft:
            # Update existing draft
            existing_draft.code_content = code_content
            existing_draft.is_auto_save = is_auto_save
            existing_draft.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing_draft)
            return existing_draft
        else:
            # Create new draft
            new_draft = TemplateDraft(
                template_id=template_id,
                user_id=user_id,
                code_content=code_content,
                is_auto_save=is_auto_save
            )
            db.add(new_draft)
            db.commit()
            db.refresh(new_draft)
            return new_draft
    
    @staticmethod
    def get_template_draft(
        db: Session,
        template_id: int,
        user_id: int
    ) -> Optional[TemplateDraft]:
        """Get a template draft for a user"""
        return db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
    
    @staticmethod
    def delete_template_draft(
        db: Session,
        template_id: int,
        user_id: int
    ) -> bool:
        """Delete a template draft"""
        draft = db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
        
        if draft:
            db.delete(draft)
            db.commit()
            return True
        return False
    
    @staticmethod
    def get_user_drafts(
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[TemplateDraft]:
        """Get all drafts for a user with template information"""
        return db.query(TemplateDraft).filter(
            TemplateDraft.user_id == user_id
        ).order_by(desc(TemplateDraft.updated_at)).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_user_submissions_stats(db: Session, user_id: int) -> dict:
        """Get submission statistics for a specific user"""
        query = db.query(TemplateSubmission).filter(TemplateSubmission.user_id == user_id)
        
        total_submissions = query.count()
        success_submissions = query.filter(TemplateSubmission.status == "success").count()
        error_submissions = query.filter(TemplateSubmission.status == "error").count()
        
        # Get submissions by language for this user
        language_stats = db.query(
            TemplateSubmission.language,
            func.count(TemplateSubmission.id).label('count')
        ).filter(TemplateSubmission.user_id == user_id).group_by(TemplateSubmission.language).all()
        
        return {
            "total_submissions": total_submissions,
            "success_submissions": success_submissions,
            "error_submissions": error_submissions,
            "success_rate": round((success_submissions / total_submissions * 100), 2) if total_submissions > 0 else 0,
            "submissions_by_language": [
                {"language": lang, "count": count} for lang, count in language_stats
            ]
        }
    
    # Template Draft Methods
    
    @staticmethod
    def save_template_draft(
        db: Session,
        template_id: int,
        user_id: int,
        code_content: str,
        is_auto_save: bool = False
    ) -> TemplateDraft:
        """Save or update a template draft for a user"""
        
        # Check if template exists and user has access
        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Check if draft already exists
        existing_draft = db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
        
        if existing_draft:
            # Update existing draft
            existing_draft.code_content = code_content
            existing_draft.is_auto_save = is_auto_save
            existing_draft.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing_draft)
            return existing_draft
        else:
            # Create new draft
            new_draft = TemplateDraft(
                template_id=template_id,
                user_id=user_id,
                code_content=code_content,
                is_auto_save=is_auto_save
            )
            db.add(new_draft)
            db.commit()
            db.refresh(new_draft)
            return new_draft
    
    @staticmethod
    def get_template_draft(
        db: Session,
        template_id: int,
        user_id: int
    ) -> Optional[TemplateDraft]:
        """Get a template draft for a user"""
        return db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
    
    @staticmethod
    def delete_template_draft(
        db: Session,
        template_id: int,
        user_id: int
    ) -> bool:
        """Delete a template draft"""
        draft = db.query(TemplateDraft).filter(
            TemplateDraft.template_id == template_id,
            TemplateDraft.user_id == user_id
        ).first()
        
        if draft:
            db.delete(draft)
            db.commit()
            return True
        return False
    
    @staticmethod
    def get_user_drafts(
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[TemplateDraft]:
        """Get all drafts for a user with template information"""
        return db.query(TemplateDraft).filter(
            TemplateDraft.user_id == user_id
        ).order_by(desc(TemplateDraft.updated_at)).offset(skip).limit(limit).all()
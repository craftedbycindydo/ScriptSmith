"""
Template Service - Business logic for managing code templates
"""

import secrets
import time
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc
from fastapi import HTTPException, status
from app.models.template import Template, TemplateSubmission
from app.models.template_draft import TemplateDraft
from app.models.user import User
from app.models.classroom import Classroom, UserClassroom


# Failed submission-code attempts, keyed by (user_id, template_id) -> timestamps.
# A 4-digit code is only 10k combinations, so unlimited guessing would defeat it.
# Process-local by design: it resets on restart and is per-worker, which is
# enough friction for a code that is only valid during one class session.
_CODE_ATTEMPTS: Dict[Tuple[int, int], List[float]] = {}
MAX_CODE_ATTEMPTS = 5
CODE_ATTEMPT_WINDOW_SECONDS = 15 * 60


class TemplateService:
    """Service for managing code templates"""

    @staticmethod
    def generate_submission_code() -> str:
        """Random 4-digit code (leading zeros kept) for in-class submission"""
        return f"{secrets.randbelow(10000):04d}"

    @staticmethod
    def _recent_failed_attempts(user_id: int, template_id: int) -> List[float]:
        """Failed code attempts still inside the lockout window"""
        cutoff = time.monotonic() - CODE_ATTEMPT_WINDOW_SECONDS
        attempts = [t for t in _CODE_ATTEMPTS.get((user_id, template_id), []) if t > cutoff]
        if attempts:
            _CODE_ATTEMPTS[(user_id, template_id)] = attempts
        else:
            _CODE_ATTEMPTS.pop((user_id, template_id), None)
        return attempts

    @staticmethod
    def verify_submission_code(
        template: Template,
        user_id: int,
        submission_code: Optional[str]
    ) -> None:
        """Check the in-class code for a student's first submission.

        Raises HTTPException when the code is missing, wrong, or when too many
        wrong codes have been tried recently.
        """
        expected = (template.submission_code or "").strip()
        if not expected:
            # Pre-dates the feature and was never backfilled - nothing to check
            return

        attempts = TemplateService._recent_failed_attempts(user_id, template.id)
        if len(attempts) >= MAX_CODE_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect submission codes. Ask your instructor and try again later."
            )

        provided = (submission_code or "").strip()
        if not provided:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A submission code is required the first time you submit this lab."
            )

        if not secrets.compare_digest(provided, expected):
            _CODE_ATTEMPTS.setdefault((user_id, template.id), []).append(time.monotonic())
            remaining = MAX_CODE_ATTEMPTS - len(_CODE_ATTEMPTS[(user_id, template.id)])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Incorrect submission code. {remaining} attempt(s) left."
                    if remaining > 0
                    else "Incorrect submission code. Ask your instructor and try again later."
                )
            )

        # Correct code - clear the failure history for this student
        _CODE_ATTEMPTS.pop((user_id, template.id), None)

    @staticmethod
    def backfill_submission_codes(db: Session) -> int:
        """Give every template still missing a submission code one (startup migration)"""
        templates = db.query(Template).filter(Template.submission_code.is_(None)).all()
        for template in templates:
            template.submission_code = TemplateService.generate_submission_code()
        if templates:
            db.commit()
        return len(templates)

    @staticmethod
    def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
        """Treat naive datetimes (how they come back from the DB) as UTC"""
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _validate_visibility_window(
        visible_from: Optional[datetime],
        submission_deadline: Optional[datetime]
    ) -> None:
        """A template must become visible before its submission deadline"""
        visible = TemplateService._as_utc(visible_from)
        deadline = TemplateService._as_utc(submission_deadline)
        if visible and deadline and visible >= deadline:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Visible time must be before the submission deadline"
            )

    @staticmethod
    def is_template_visible(template: Template, current_time: Optional[datetime] = None) -> bool:
        """Whether a template is currently visible to students (no visible_from = always)"""
        if not template.visible_from:
            return True
        current_time = current_time or datetime.now(timezone.utc)
        return current_time >= TemplateService._as_utc(template.visible_from)

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
        exclusions: Optional[List[Dict]] = None,
        visible_from: Optional[datetime] = None
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

        TemplateService._validate_visibility_window(visible_from, submission_deadline)

        # Enrich exclusions with usernames if provided
        enriched_exclusions = None
        if exclusions:
            # Batch fetch all user IDs that need username lookup (avoid N+1 problem)
            user_ids_needing_lookup = [
                ex['user_id'] for ex in exclusions 
                if 'username' not in ex or not ex.get('username')
            ]
            
            username_map = {}
            if user_ids_needing_lookup:
                users = db.query(User.id, User.username).filter(
                    User.id.in_(user_ids_needing_lookup)
                ).all()
                username_map = {u.id: u.username for u in users}
            
            enriched_exclusions = []
            for exclusion in exclusions:
                enriched_exclusion = exclusion.copy()
                # Use pre-fetched username (no extra DB queries!)
                if 'username' not in enriched_exclusion or not enriched_exclusion['username']:
                    enriched_exclusion['username'] = username_map.get(
                        exclusion['user_id'], 
                        f"User {exclusion['user_id']}"
                    )
                enriched_exclusions.append(enriched_exclusion)
        
        template = Template(
            name=name,
            description=description,
            language=language,
            code_content=code_content,
            created_by=created_by,
            submission_deadline=submission_deadline,
            exclusions=enriched_exclusions,
            visible_from=visible_from,
            submission_code=TemplateService.generate_submission_code()
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
    def count_all_templates(db: Session) -> int:
        """How many active templates exist."""
        try:
            return db.query(Template).filter(Template.is_active == True).count()
        except Exception as e:
            print(f"Error counting templates: {str(e)}")
            return 0

    @staticmethod
    def get_all_templates(db: Session, skip: int = 0, limit: int = 100) -> List[Template]:
        """Get all active templates with pagination (Admin only)"""
        try:
            return db.query(Template).filter(
                Template.is_active == True
            ).order_by(Template.updated_at.desc(), Template.created_at.desc()).offset(skip).limit(limit).all()
        except Exception as e:
            print(f"Error getting templates: {str(e)}")
            return []
    
    @staticmethod
    def get_templates_for_user(
        db: Session, 
        user_id: int, 
        language: Optional[str] = None,
        skip: int = 0,
        limit: int = None,  # No limit - return ALL templates, UI will handle display
        include_hidden: bool = False  # Admins may preview templates not yet visible
    ) -> List[Template]:
        """Get templates accessible to a specific user based on their classroom memberships"""
        try:
            now = datetime.now(timezone.utc)
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

                # 4b. Hide templates scheduled to become visible later
                if not include_hidden:
                    templates = [
                        t for t in templates
                        if TemplateService.is_template_visible(t, now)
                    ]

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

                # Hide templates scheduled to become visible later
                if not include_hidden:
                    templates = [
                        t for t in templates
                        if TemplateService.is_template_visible(t, now)
                    ]

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
        exclusions: Optional[List[Dict]] = None,
        visible_from: Optional[datetime] = None,
        clear_visible_from: bool = False  # Explicitly unschedule (visible immediately)
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
        if visible_from is not None:
            template.visible_from = visible_from
        elif clear_visible_from:
            template.visible_from = None
        TemplateService._validate_visibility_window(
            template.visible_from, template.submission_deadline
        )
        if exclusions is not None:
            # Batch fetch all user IDs that need username lookup (avoid N+1 problem)
            user_ids_needing_lookup = [
                ex['user_id'] for ex in exclusions 
                if 'username' not in ex or not ex.get('username')
            ]
            
            username_map = {}
            if user_ids_needing_lookup:
                users = db.query(User.id, User.username).filter(
                    User.id.in_(user_ids_needing_lookup)
                ).all()
                username_map = {u.id: u.username for u in users}
            
            # Enrich exclusions with usernames (no extra DB queries!)
            enriched_exclusions = []
            for exclusion in exclusions:
                enriched_exclusion = exclusion.copy()
                if 'username' not in enriched_exclusion or not enriched_exclusion['username']:
                    enriched_exclusion['username'] = username_map.get(
                        exclusion['user_id'], 
                        f"User {exclusion['user_id']}"
                    )
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
            from datetime import timedelta  # module-level datetime must not be shadowed here
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
        error_message: str = None,
        submission_code: Optional[str] = None
    ) -> TemplateSubmission:
        """Submit code for a template with execution results.

        The first submission must carry the lab's in-class code. After that the
        student may resubmit without it, as long as the deadline hasn't passed.
        """
        
        # Check if template exists and is active
        template = TemplateService.get_template_by_id(db, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found"
            )
        
        # Template hasn't been released to students yet
        if not TemplateService.is_template_visible(template):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This template is not available yet"
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
            submission_time = datetime.now(timezone.utc).isoformat()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Submission denied - submitted at: {submission_time}, deadline: {deadline_info}"
            )
        
        # Check if user has already submitted
        existing_submission = db.query(TemplateSubmission).filter(
            TemplateSubmission.template_id == template_id,
            TemplateSubmission.user_id == user_id
        ).first()

        # First hand-in has to prove the student is in class; later ones don't
        if not existing_submission:
            TemplateService.verify_submission_code(template, user_id, submission_code)

        if existing_submission:
            # Resubmission inside the deadline replaces the previous attempt
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
        """Check if user can submit for a template based on visibility and deadline"""

        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            return False, None

        return TemplateService._check_can_submit_for_template(template, user_id)

    @staticmethod
    def effective_deadline(template: Template, user_id: int) -> Optional[datetime]:
        """The deadline that applies to this user: their exclusion wins over the general one"""
        if template.exclusions:
            for exclusion in template.exclusions:
                if exclusion.get("user_id") == user_id and exclusion.get("deadline"):
                    try:
                        return TemplateService._as_utc(
                            datetime.fromisoformat(exclusion["deadline"].replace('Z', '+00:00'))
                        )
                    except ValueError:
                        break  # Malformed exclusion date, fall back to the general deadline
        return TemplateService._as_utc(template.submission_deadline)

    @staticmethod
    def _check_can_submit_for_template(
        template: Template,
        user_id: int
    ) -> tuple[bool, Optional[str]]:
        """
        Whether the user may submit right now, and the deadline that applies.

        A lab is open from its visible time until its deadline. Inside that
        window a student may resubmit as often as they like (the first
        submission is the one that needs the in-class code); once the deadline
        passes nothing more is accepted.
        """
        current_time = datetime.now(timezone.utc)

        # Template hasn't been released yet - nothing to submit
        if not TemplateService.is_template_visible(template, current_time):
            return False, None

        deadline = TemplateService.effective_deadline(template, user_id)
        if deadline is None:
            # No deadline set, submissions stay open
            return True, None

        return current_time <= deadline, deadline.isoformat()

    @staticmethod
    def batch_check_can_submit(
        db: Session,
        templates: List[Template],
        user_id: int
    ) -> Dict[int, tuple[bool, Optional[str], bool]]:
        """
        Batch version of can_user_submit for a list of templates.
        Returns template_id -> (can_submit, deadline_info, has_submitted).
        """
        if not templates:
            return {}

        template_ids = [t.id for t in templates]

        # Fetch ALL user submissions for these templates in ONE query
        submitted_ids = {
            row[0] for row in db.query(TemplateSubmission.template_id).filter(
                TemplateSubmission.template_id.in_(template_ids),
                TemplateSubmission.user_id == user_id
            ).all()
        }

        results = {}
        for template in templates:
            can_submit, deadline_info = TemplateService._check_can_submit_for_template(
                template, user_id
            )
            results[template.id] = (can_submit, deadline_info, template.id in submitted_ids)

        return results
    
    @staticmethod
    def get_missed_templates(db: Session, user_id: int) -> List[Dict]:
        """
        Templates assigned to the user whose deadline has passed with nothing submitted.

        Deadline resolution matches _check_can_submit_for_template: a user-specific
        exclusion deadline wins over the template's general deadline, and a template
        with no deadline at all can never be missed.
        """
        templates = TemplateService.get_templates_for_user(db=db, user_id=user_id)
        if not templates:
            return []

        submitted_ids = {
            row[0] for row in db.query(TemplateSubmission.template_id).filter(
                TemplateSubmission.template_id.in_([t.id for t in templates]),
                TemplateSubmission.user_id == user_id,
            ).all()
        }

        current_time = datetime.now(timezone.utc)
        missed = []
        for template in templates:
            if template.id in submitted_ids:
                continue

            deadline = TemplateService.effective_deadline(template, user_id)
            if deadline is None:
                continue  # no deadline -> still open, not missed

            if current_time > deadline:
                missed.append({
                    "template_id": template.id,
                    "template_name": template.name,
                    "language": template.language,
                    "deadline": deadline.isoformat(),
                })

        missed.sort(key=lambda m: m["deadline"], reverse=True)
        return missed

    @staticmethod
    def get_user_submission(db: Session, template_id: int, user_id: int) -> Optional[TemplateSubmission]:
        """Get user's submission for a specific template"""
        return db.query(TemplateSubmission).filter(
            TemplateSubmission.template_id == template_id,
            TemplateSubmission.user_id == user_id
        ).first()
    
    @staticmethod
    def _submissions_query(
        db: Session,
        template_id: int = None,
        user_id: int = None,
        status: str = None,
        language: str = None,
        template_name: str = None,
    ):
        """The filtered query, before any paging. Filters belong here so a
        search covers every page, not just the one being fetched."""
        query = db.query(TemplateSubmission)

        if template_id is not None:
            query = query.filter(TemplateSubmission.template_id == template_id)

        if user_id is not None:
            query = query.filter(TemplateSubmission.user_id == user_id)

        if status:
            query = query.filter(TemplateSubmission.status == status)

        if language:
            query = query.filter(TemplateSubmission.language == language)

        if template_name:
            query = query.filter(TemplateSubmission.template_name.ilike(f"%{template_name}%"))

        return query

    @staticmethod
    def count_template_submissions(
        db: Session,
        template_id: int = None,
        user_id: int = None,
        status: str = None,
        language: str = None,
        template_name: str = None,
    ) -> int:
        """How many submissions match."""
        return TemplateService._submissions_query(
            db, template_id, user_id, status, language, template_name
        ).count()

    @staticmethod
    def get_template_submissions(
        db: Session, 
        template_id: int = None,
        user_id: int = None,
        status: str = None,
        language: str = None,
        skip: int = 0,
        limit: int = 100,
        template_name: str = None,
    ) -> List[TemplateSubmission]:
        """One page of submissions, newest first."""
        query = TemplateService._submissions_query(
            db, template_id, user_id, status, language, template_name
        )
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
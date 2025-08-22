"""
Migration Service - Handles data migration for classroom multi-tenancy

This service provides methods to migrate existing data to the classroom-based system
while preserving all existing functionality.
"""

from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.classroom import Classroom, UserClassroom
from app.models.user import User, UserRole
from app.models.template import Template
from app.models.user_template import UserTemplate
from app.models.assignment import Assignment
from app.models.code_submission import CodeSubmission
from app.models.collaboration import CollaborationSession
from app.models.admin_settings import AdminSettings
from app.services.classroom_service import ClassroomService
import logging

logger = logging.getLogger(__name__)


class MigrationService:
    """Service for migrating existing data to classroom-based multi-tenancy"""
    
    @staticmethod
    def create_default_classroom(db: Session) -> Classroom:
        """Create a default classroom for existing data migration"""
        
        # Find the first admin user to be the creator
        admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
        
        if not admin_user:
            # Create a default admin if none exists
            logger.warning("No admin user found. Creating default admin for migration.")
            admin_user = User(
                email="admin@classroom.local",
                username="admin",
                hashed_password="$2b$12$placeholder",  # Will need to be changed
                role=UserRole.ADMIN,
                full_name="System Administrator"
            )
            db.add(admin_user)
            db.flush()
        
        # Create default classroom
        default_classroom = ClassroomService.create_classroom(
            db=db,
            name="Default Classroom",
            description="Default classroom for existing users and data",
            created_by=admin_user,
            classroom_key="DEFAULT01"
        )
        
        logger.info(f"Created default classroom: {default_classroom.id}")
        return default_classroom
    
    @staticmethod
    def migrate_users_to_default_classroom(db: Session, default_classroom: Classroom) -> int:
        """Migrate all existing users to the default classroom"""
        
        migrated_count = 0
        
        # Get all users who aren't already in any classroom
        users_without_classroom = db.query(User).filter(
            ~User.id.in_(
                db.query(UserClassroom.user_id).filter(UserClassroom.is_active == True)
            )
        ).all()
        
        for user in users_without_classroom:
            try:
                # Determine role based on user type
                role = "TEACHER" if user.is_admin else "STUDENT"
                
                ClassroomService.add_user_to_classroom(
                    db=db,
                    user=user,
                    classroom=default_classroom,
                    role=role
                )
                
                migrated_count += 1
                logger.info(f"Migrated user {user.username} to default classroom as {role}")
                
            except Exception as e:
                logger.error(f"Failed to migrate user {user.username}: {str(e)}")
        
        return migrated_count
    
    @staticmethod
    def migrate_templates_to_classroom(db: Session, classroom_id: int) -> int:
        """Migrate existing templates to a classroom"""
        
        # Note: This requires that classroom_id column be added as nullable first
        migrated_count = db.execute(
            text("UPDATE templates SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
            {"classroom_id": classroom_id}
        ).rowcount
        
        logger.info(f"Migrated {migrated_count} templates to classroom {classroom_id}")
        return migrated_count
    
    @staticmethod
    def migrate_user_templates_to_classroom(db: Session, classroom_id: int) -> int:
        """Migrate existing user templates to a classroom"""
        
        migrated_count = db.execute(
            text("UPDATE user_templates SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
            {"classroom_id": classroom_id}
        ).rowcount
        
        logger.info(f"Migrated {migrated_count} user templates to classroom {classroom_id}")
        return migrated_count
    
    @staticmethod
    def migrate_assignments_to_classroom(db: Session, classroom_id: int) -> int:
        """Migrate existing assignments to a classroom"""
        
        migrated_count = db.execute(
            text("UPDATE assignments SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
            {"classroom_id": classroom_id}
        ).rowcount
        
        logger.info(f"Migrated {migrated_count} assignments to classroom {classroom_id}")
        return migrated_count
    
    @staticmethod
    def migrate_code_submissions_to_classroom(db: Session, classroom_id: int) -> int:
        """Migrate existing code submissions to a classroom"""
        
        migrated_count = db.execute(
            text("UPDATE code_submissions SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
            {"classroom_id": classroom_id}
        ).rowcount
        
        logger.info(f"Migrated {migrated_count} code submissions to classroom {classroom_id}")
        return migrated_count
    
    @staticmethod
    def migrate_collaboration_sessions_to_classroom(db: Session, classroom_id: int) -> int:
        """Migrate existing collaboration sessions to a classroom"""
        
        migrated_count = db.execute(
            text("UPDATE collaboration_sessions SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
            {"classroom_id": classroom_id}
        ).rowcount
        
        logger.info(f"Migrated {migrated_count} collaboration sessions to classroom {classroom_id}")
        return migrated_count
    
    @staticmethod
    def migrate_admin_settings_to_classroom(db: Session, classroom_id: int) -> bool:
        """Migrate existing admin settings to classroom-specific settings"""
        
        try:
            # Get existing global settings if any
            global_settings = db.execute(
                text("SELECT * FROM admin_settings WHERE classroom_id IS NULL LIMIT 1")
            ).fetchone()
            
            if global_settings:
                # Create classroom-specific settings based on global ones
                db.execute(
                    text("""
                    INSERT INTO admin_settings (classroom_id, copy_paste_enabled, updated_by, notes, created_at, updated_at)
                    VALUES (:classroom_id, :copy_paste_enabled, :updated_by, :notes, NOW(), NOW())
                    """),
                    {
                        "classroom_id": classroom_id,
                        "copy_paste_enabled": global_settings[2],  # Assuming column order
                        "updated_by": global_settings[5] or "migration",
                        "notes": f"Migrated from global settings: {global_settings[7] or ''}"
                    }
                )
                
                # Remove old global settings
                db.execute(text("DELETE FROM admin_settings WHERE classroom_id IS NULL"))
                
                logger.info(f"Migrated admin settings to classroom {classroom_id}")
                return True
            else:
                # Create default settings
                AdminSettings.get_or_create_default(db, classroom_id)
                logger.info(f"Created default admin settings for classroom {classroom_id}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to migrate admin settings: {str(e)}")
            return False
    
    @staticmethod
    def perform_full_migration(db: Session) -> dict:
        """Perform complete migration to classroom system"""
        
        logger.info("Starting full migration to classroom system")
        
        try:
            # Step 1: Create default classroom
            default_classroom = MigrationService.create_default_classroom(db)
            
            # Step 2: Migrate users
            users_migrated = MigrationService.migrate_users_to_default_classroom(db, default_classroom)
            
            # Step 3: Migrate all data to default classroom
            templates_migrated = MigrationService.migrate_templates_to_classroom(db, default_classroom.id)
            user_templates_migrated = MigrationService.migrate_user_templates_to_classroom(db, default_classroom.id)
            assignments_migrated = MigrationService.migrate_assignments_to_classroom(db, default_classroom.id)
            code_submissions_migrated = MigrationService.migrate_code_submissions_to_classroom(db, default_classroom.id)
            collaboration_sessions_migrated = MigrationService.migrate_collaboration_sessions_to_classroom(db, default_classroom.id)
            admin_settings_migrated = MigrationService.migrate_admin_settings_to_classroom(db, default_classroom.id)
            
            db.commit()
            
            result = {
                "success": True,
                "default_classroom_id": default_classroom.id,
                "default_classroom_key": default_classroom.classroom_key,
                "migrated_counts": {
                    "users": users_migrated,
                    "templates": templates_migrated,
                    "user_templates": user_templates_migrated,
                    "assignments": assignments_migrated,
                    "code_submissions": code_submissions_migrated,
                    "collaboration_sessions": collaboration_sessions_migrated,
                    "admin_settings": admin_settings_migrated
                }
            }
            
            logger.info(f"Migration completed successfully: {result}")
            return result
            
        except Exception as e:
            db.rollback()
            logger.error(f"Migration failed: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def check_migration_needed(db: Session) -> bool:
        """Check if migration is needed (i.e., if there are classrooms yet)"""
        
        classroom_count = db.query(Classroom).count()
        return classroom_count == 0
    
    @staticmethod
    def get_migration_status(db: Session) -> dict:
        """Get current migration status"""
        
        # Count data without classroom assignments
        users_without_classroom = db.query(User).filter(
            ~User.id.in_(
                db.query(UserClassroom.user_id).filter(UserClassroom.is_active == True)
            )
        ).count()
        
        # Count entities that might need classroom assignment
        orphaned_data = {
            "users_without_classroom": users_without_classroom,
            "total_classrooms": db.query(Classroom).count(),
            "total_users": db.query(User).count()
        }
        
        return {
            "migration_needed": MigrationService.check_migration_needed(db),
            "orphaned_data": orphaned_data
        }

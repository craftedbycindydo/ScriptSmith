"""
Database Migration Service - Handles schema migrations for classroom multi-tenancy

This service provides safe database migrations that:
- Add classroom_id columns to existing tables
- Create default classroom and migrate existing data  
- Handle backward compatibility during migration
"""

import logging
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, Column, Integer, ForeignKey
from sqlalchemy.exc import OperationalError, IntegrityError
from app.models.classroom import Classroom, UserClassroom
from app.models.user import User, UserRole
from app.models.admin_settings import AdminSettings
from app.services.classroom_service import ClassroomService

logger = logging.getLogger(__name__)


class DatabaseMigrationService:
    """Service for handling database schema migrations"""
    
    @staticmethod
    def get_table_columns(db: Session, table_name: str) -> List[str]:
        """Get list of columns in a table"""
        try:
            inspector = inspect(db.bind)
            columns = inspector.get_columns(table_name)
            return [col['name'] for col in columns]
        except Exception as e:
            logger.error(f"Failed to inspect table {table_name}: {e}")
            return []
    
    @staticmethod
    def column_exists(db: Session, table_name: str, column_name: str) -> bool:
        """Check if a column exists in a table"""
        columns = DatabaseMigrationService.get_table_columns(db, table_name)
        return column_name in columns
    
    @staticmethod
    def table_exists(db: Session, table_name: str) -> bool:
        """Check if a table exists"""
        try:
            inspector = inspect(db.bind)
            return table_name in inspector.get_table_names()
        except Exception as e:
            logger.error(f"Failed to check if table {table_name} exists: {e}")
            return False
    
    @staticmethod
    def add_column_if_not_exists(db: Session, table_name: str, column_name: str, column_definition: str) -> bool:
        """Add a column to a table if it doesn't exist"""
        try:
            if not DatabaseMigrationService.column_exists(db, table_name, column_name):
                sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
                db.execute(text(sql))
                db.commit()
                logger.info(f"Added column {column_name} to table {table_name}")
                return True
            else:
                logger.info(f"Column {column_name} already exists in table {table_name}")
                return False
        except Exception as e:
            logger.error(f"Failed to add column {column_name} to {table_name}: {e}")
            db.rollback()
            return False
    
    @staticmethod
    def get_or_create_default_classroom(db: Session) -> Optional[Classroom]:
        """Get existing default classroom or create one"""
        try:
            # Check if any classrooms exist
            existing_classroom = db.query(Classroom).first()
            if existing_classroom:
                logger.info(f"Using existing classroom: {existing_classroom.name}")
                return existing_classroom
            
            # Find or create an admin user
            admin_user = db.query(User).filter(User.role == UserRole.ADMIN).first()
            if not admin_user:
                # Look for any user to make admin temporarily
                any_user = db.query(User).first()
                if any_user:
                    any_user.role = UserRole.ADMIN
                    admin_user = any_user
                    logger.info(f"Promoted user {any_user.username} to admin for migration")
                else:
                    # Create a default admin user
                    from app.services.auth import AuthService
                    admin_user = AuthService.create_user(
                        db=db,
                        email="admin@classroom.local",
                        username="admin",
                        password="TempPass123!"
                    )
                    admin_user.role = UserRole.ADMIN
                    logger.info("Created default admin user for migration")
                
                db.commit()
            
            # Create default classroom
            classroom = Classroom(
                name="Default Classroom",
                description="Default classroom for existing users and data",
                classroom_key="DEFAULT01",
                created_by_id=admin_user.id
            )
            
            db.add(classroom)
            db.flush()  # Get the ID
            
            # Add admin as teacher
            admin_membership = UserClassroom(
                user_id=admin_user.id,
                classroom_id=classroom.id,
                role="TEACHER"
            )
            db.add(admin_membership)
            
            db.commit()
            logger.info(f"Created default classroom: {classroom.name} (ID: {classroom.id})")
            
            return classroom
            
        except Exception as e:
            logger.error(f"Failed to create default classroom: {e}")
            db.rollback()
            return None
    
    @staticmethod
    def migrate_users_to_classroom(db: Session, classroom: Classroom) -> int:
        """Migrate existing users to the default classroom"""
        try:
            migrated_count = 0
            
            # Get all users who aren't in any classroom
            users = db.query(User).all()
            
            for user in users:
                # Check if user is already in this classroom
                existing_membership = db.query(UserClassroom).filter(
                    UserClassroom.user_id == user.id,
                    UserClassroom.classroom_id == classroom.id
                ).first()
                
                if not existing_membership:
                    role = "TEACHER" if user.is_admin else "STUDENT"
                    membership = UserClassroom(
                        user_id=user.id,
                        classroom_id=classroom.id,
                        role=role
                    )
                    db.add(membership)
                    migrated_count += 1
            
            db.commit()
            logger.info(f"Migrated {migrated_count} users to default classroom")
            return migrated_count
            
        except Exception as e:
            logger.error(f"Failed to migrate users: {e}")
            db.rollback()
            return 0
    
    @staticmethod
    def migrate_table_data(db: Session, table_name: str, classroom_id: int) -> int:
        """Migrate existing table data to use classroom_id"""
        try:
            # Update all NULL classroom_id values
            result = db.execute(
                text(f"UPDATE {table_name} SET classroom_id = :classroom_id WHERE classroom_id IS NULL"),
                {"classroom_id": classroom_id}
            )
            
            affected_rows = result.rowcount
            db.commit()
            
            logger.info(f"Updated {affected_rows} rows in {table_name} with classroom_id {classroom_id}")
            return affected_rows
            
        except Exception as e:
            logger.error(f"Failed to migrate {table_name}: {e}")
            db.rollback()
            return 0
    
    @staticmethod
    def run_classroom_migration(db: Session) -> Dict[str, Any]:
        """Run the complete classroom migration"""
        logger.info("Starting classroom database migration...")
        
        migration_results = {
            "success": False,
            "tables_migrated": [],
            "users_migrated": 0,
            "default_classroom_created": False,
            "errors": []
        }
        
        try:
            # Step 1: Ensure classroom tables exist
            if not DatabaseMigrationService.table_exists(db, "classrooms"):
                logger.error("Classrooms table does not exist. Please run database creation first.")
                migration_results["errors"].append("Classrooms table missing")
                return migration_results
            
            # Step 2: Get or create default classroom
            default_classroom = DatabaseMigrationService.get_or_create_default_classroom(db)
            if not default_classroom:
                migration_results["errors"].append("Failed to create default classroom")
                return migration_results
            
            migration_results["default_classroom_created"] = True
            migration_results["default_classroom_id"] = default_classroom.id
            migration_results["default_classroom_key"] = default_classroom.classroom_key
            
            # Step 3: Migrate users to classroom
            users_migrated = DatabaseMigrationService.migrate_users_to_classroom(db, default_classroom)
            migration_results["users_migrated"] = users_migrated
            
            # Step 4: Add classroom_id columns to tables that need them
            tables_to_migrate = [
                ("templates", "INTEGER REFERENCES classrooms(id)"),
                ("user_templates", "INTEGER REFERENCES classrooms(id)"),
                ("assignments", "INTEGER REFERENCES classrooms(id)"),
                ("code_submissions", "INTEGER REFERENCES classrooms(id)"),
                ("collaboration_sessions", "INTEGER REFERENCES classrooms(id)"),
                ("admin_settings", "INTEGER REFERENCES classrooms(id)")
            ]
            
            for table_name, column_definition in tables_to_migrate:
                if DatabaseMigrationService.table_exists(db, table_name):
                    # Add classroom_id column as nullable first
                    if DatabaseMigrationService.add_column_if_not_exists(
                        db, table_name, "classroom_id", column_definition
                    ):
                        # Migrate existing data
                        migrated_rows = DatabaseMigrationService.migrate_table_data(
                            db, table_name, default_classroom.id
                        )
                        migration_results["tables_migrated"].append({
                            "table": table_name,
                            "rows_updated": migrated_rows
                        })
            
            # Step 5: Create default admin settings if needed
            try:
                existing_settings = db.query(AdminSettings).filter(
                    AdminSettings.classroom_id == default_classroom.id
                ).first()
                
                if not existing_settings:
                    default_settings = AdminSettings(
                        classroom_id=default_classroom.id,
                        copy_paste_enabled=True,
                        notes="Default settings created during migration"
                    )
                    db.add(default_settings)
                    db.commit()
                    logger.info("Created default admin settings")
            except Exception as e:
                logger.warning(f"Could not create default admin settings: {e}")
            
            migration_results["success"] = True
            logger.info("Classroom migration completed successfully!")
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            migration_results["errors"].append(str(e))
            db.rollback()
        
        return migration_results
    
    @staticmethod
    def is_migration_needed(db: Session) -> bool:
        """Check if migration is needed"""
        try:
            # Check if classrooms table exists and has data
            if not DatabaseMigrationService.table_exists(db, "classrooms"):
                return True
            
            classroom_count = db.query(Classroom).count()
            if classroom_count == 0:
                return True
            
            # Check if any core tables are missing classroom_id column
            tables_to_check = ["templates", "code_submissions", "assignments"]
            for table in tables_to_check:
                if (DatabaseMigrationService.table_exists(db, table) and 
                    not DatabaseMigrationService.column_exists(db, table, "classroom_id")):
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking migration status: {e}")
            return True
    
    @staticmethod
    def get_migration_status(db: Session) -> Dict[str, Any]:
        """Get detailed migration status"""
        status = {
            "migration_needed": DatabaseMigrationService.is_migration_needed(db),
            "classrooms_exist": False,
            "classroom_count": 0,
            "table_status": {},
            "user_count": 0,
            "users_in_classrooms": 0
        }
        
        try:
            # Check classrooms
            if DatabaseMigrationService.table_exists(db, "classrooms"):
                status["classrooms_exist"] = True
                status["classroom_count"] = db.query(Classroom).count()
            
            # Check table columns
            tables_to_check = ["templates", "user_templates", "assignments", "code_submissions", "collaboration_sessions"]
            for table in tables_to_check:
                if DatabaseMigrationService.table_exists(db, table):
                    status["table_status"][table] = {
                        "exists": True,
                        "has_classroom_id": DatabaseMigrationService.column_exists(db, table, "classroom_id")
                    }
                else:
                    status["table_status"][table] = {"exists": False}
            
            # Check users
            status["user_count"] = db.query(User).count()
            status["users_in_classrooms"] = db.query(UserClassroom).filter(
                UserClassroom.is_active == True
            ).count()
            
        except Exception as e:
            logger.error(f"Error getting migration status: {e}")
        
        return status

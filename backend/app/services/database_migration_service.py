"""
Database Migration Service - Automatic performance optimizations
Runs during application startup to ensure optimal database performance
"""

from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError, ProgrammingError
from app.database.base import engine
import logging

logger = logging.getLogger(__name__)

class DatabaseMigrationService:
    """Service to handle database performance optimizations automatically"""
    
    def __init__(self):
        self.migration_version = "v1_performance_optimization"
        self.migration_table = "migration_history"
    
    def _create_migration_table(self):
        """Create migration tracking table if it doesn't exist"""
        try:
            with engine.connect() as connection:
                connection.execute(text(f"""
                    CREATE TABLE IF NOT EXISTS {self.migration_table} (
                        id SERIAL PRIMARY KEY,
                        migration_name VARCHAR(255) UNIQUE NOT NULL,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        description TEXT
                    )
                """))
                connection.commit()
                logger.info("Migration tracking table ensured")
        except Exception as e:
            logger.error(f"Error creating migration table: {e}")
            raise
    
    def _is_migration_applied(self, migration_name: str) -> bool:
        """Check if a migration has already been applied"""
        try:
            with engine.connect() as connection:
                result = connection.execute(text(f"""
                    SELECT COUNT(*) FROM {self.migration_table} 
                    WHERE migration_name = :migration_name
                """), {"migration_name": migration_name})
                return result.scalar() > 0
        except Exception as e:
            logger.warning(f"Error checking migration status: {e}")
            return False
    
    def _record_migration(self, migration_name: str, description: str):
        """Record that a migration has been applied"""
        try:
            with engine.connect() as connection:
                connection.execute(text(f"""
                    INSERT INTO {self.migration_table} (migration_name, description)
                    VALUES (:migration_name, :description)
                    ON CONFLICT (migration_name) DO NOTHING
                """), {
                    "migration_name": migration_name, 
                    "description": description
                })
                connection.commit()
                logger.info(f"Migration recorded: {migration_name}")
        except Exception as e:
            logger.error(f"Error recording migration: {e}")
    
    def _create_index_safely(self, connection, index_name: str, table_name: str, columns: str, where_clause: str = ""):
        """Create index if it doesn't exist"""
        try:
            # Check if index exists
            inspector = inspect(engine)
            existing_indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
            
            if index_name not in existing_indexes:
                sql = f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {index_name} ON {table_name} {columns}"
                if where_clause:
                    sql += f" WHERE {where_clause}"
                
                connection.execute(text(sql))
                logger.info(f"Created index: {index_name}")
            else:
                logger.info(f"Index already exists: {index_name}")
                
        except (OperationalError, ProgrammingError) as e:
            # Handle cases where table doesn't exist yet
            if "does not exist" in str(e):
                logger.warning(f"Table {table_name} doesn't exist yet, skipping index {index_name}")
            else:
                logger.error(f"Error creating index {index_name}: {e}")
        except Exception as e:
            logger.error(f"Unexpected error creating index {index_name}: {e}")
    
    def apply_performance_optimizations(self):
        """Apply all performance optimizations"""
        migration_name = self.migration_version
        
        # Check if already applied
        if self._is_migration_applied(migration_name):
            logger.info(f"Performance optimizations already applied: {migration_name}")
            return True
        
        logger.info("Applying database performance optimizations...")
        
        try:
            # Create migration tracking table first
            self._create_migration_table()
            
            with engine.connect() as connection:
                # Set timeout for the migration
                connection.execute(text("SET statement_timeout = '300s'"))
                
                # Performance indexes for classroom-scoped queries
                performance_indexes = [
                    # UserClassroom indexes
                    ("idx_user_classroom_classroom_id", "user_classrooms", "(classroom_id)"),
                    ("idx_user_classroom_user_id_active", "user_classrooms", "(user_id, is_active)"),
                    ("idx_user_classroom_active_composite", "user_classrooms", "(classroom_id, is_active, user_id)"),
                    
                    # CodeSubmission indexes  
                    ("idx_code_submission_classroom_user", "code_submissions", "(classroom_id, user_id)"),
                    ("idx_code_submission_created_at", "code_submissions", "(created_at DESC)"),
                    ("idx_code_submission_status_classroom", "code_submissions", "(status, classroom_id)"),
                    ("idx_code_submission_language_classroom", "code_submissions", "(language, classroom_id)"),
                    
                    # CollaborationSession indexes
                    ("idx_collaboration_session_classroom", "collaboration_sessions", "(classroom_id, is_active)"),
                    ("idx_collaboration_session_owner_classroom", "collaboration_sessions", "(owner_id, classroom_id)"),
                    ("idx_collaboration_session_created_at", "collaboration_sessions", "(created_at DESC)"),
                    
                    # CollaborationParticipant indexes  
                    ("idx_collaboration_participant_session", "collaboration_participants", "(session_id, status)"),
                    ("idx_collaboration_participant_user", "collaboration_participants", "(user_id, is_connected)"),
                    
                    # Template indexes
                    ("idx_template_classroom_active", "templates", "(classroom_id, is_active)"),
                    ("idx_template_created_by_classroom", "templates", "(created_by, classroom_id)"),
                    
                    # AdminSettings indexes
                    ("idx_admin_settings_classroom", "admin_settings", "(classroom_id)"),
                    
                    # User indexes
                    ("idx_user_active_role", "users", "(is_active, role)"),
                    ("idx_user_created_at", "users", "(created_at DESC)"),
                ]
                
                # Create regular indexes
                for index_name, table_name, columns in performance_indexes:
                    self._create_index_safely(connection, index_name, table_name, columns)
                
                # Create partial indexes (more efficient for common queries)
                partial_indexes = [
                    ("idx_active_user_classroom", "user_classrooms", "(classroom_id, user_id)", "is_active = true"),
                    ("idx_successful_executions", "code_submissions", "(created_at DESC, user_id, classroom_id)", "status = 'success'"),
                    ("idx_active_sessions", "collaboration_sessions", "(owner_id, created_at DESC)", "is_active = true"),
                ]
                
                # Create partial indexes
                for index_name, table_name, columns, where_clause in partial_indexes:
                    self._create_index_safely(connection, index_name, table_name, columns, where_clause)
                
                # Update table statistics for query optimization
                tables_to_analyze = [
                    "user_classrooms", "code_submissions", "collaboration_sessions", 
                    "collaboration_participants", "templates", "admin_settings", "users"
                ]
                
                for table in tables_to_analyze:
                    try:
                        connection.execute(text(f"ANALYZE {table}"))
                        logger.info(f"Analyzed table: {table}")
                    except Exception as e:
                        logger.warning(f"Could not analyze table {table}: {e}")
                
                connection.commit()
                logger.info("All performance indexes created successfully")
            
            # Record successful migration
            self._record_migration(
                migration_name, 
                "Applied performance indexes and optimizations for Railway.app deployment"
            )
            
            logger.info("✅ Database performance optimizations applied successfully!")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error applying performance optimizations: {e}")
            raise
    
    def get_migration_status(self) -> dict:
        """Get status of all applied migrations"""
        try:
            with engine.connect() as connection:
                result = connection.execute(text(f"""
                    SELECT migration_name, applied_at, description 
                    FROM {self.migration_table} 
                    ORDER BY applied_at DESC
                """))
                
                return {
                    "migrations": [
                        {
                            "name": row[0],
                            "applied_at": row[1].isoformat() if row[1] else None,
                            "description": row[2]
                        }
                        for row in result
                    ]
                }
        except Exception as e:
            logger.error(f"Error getting migration status: {e}")
            return {"migrations": [], "error": str(e)}

# Global service instance
migration_service = DatabaseMigrationService()

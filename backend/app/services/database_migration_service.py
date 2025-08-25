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
                
                # Performance indexes optimized for Railway.app admin APIs
                performance_indexes = [
                    # UserClassroom indexes - Critical for admin queries
                    ("idx_user_classroom_classroom_id", "user_classrooms", "(classroom_id)"),
                    ("idx_user_classroom_user_id_active", "user_classrooms", "(user_id, is_active)"),
                    ("idx_user_classroom_active_composite", "user_classrooms", "(classroom_id, is_active, user_id)"),
                    ("idx_user_classroom_covering", "user_classrooms", "(classroom_id, user_id, is_active)"),
                    
                    # CodeSubmission indexes - Optimized for admin stats and activities
                    ("idx_code_submission_classroom_user", "code_submissions", "(classroom_id, user_id)"),
                    ("idx_code_submission_created_at_desc", "code_submissions", "(created_at DESC)"),
                    ("idx_code_submission_status_classroom", "code_submissions", "(status, classroom_id)"),
                    ("idx_code_submission_language_stats", "code_submissions", "(language, classroom_id) WHERE language IS NOT NULL"),
                    ("idx_code_submission_user_created", "code_submissions", "(user_id, created_at DESC)"),
                    ("idx_code_submission_null_classroom", "code_submissions", "(user_id, created_at DESC) WHERE classroom_id IS NULL"),
                    
                    # CollaborationSession indexes - For session statistics
                    ("idx_collaboration_session_classroom_active", "collaboration_sessions", "(classroom_id, is_active)"),
                    ("idx_collaboration_session_owner_classroom", "collaboration_sessions", "(owner_id, classroom_id)"),
                    ("idx_collaboration_session_created_desc", "collaboration_sessions", "(created_at DESC)"),
                    ("idx_collaboration_session_null_classroom", "collaboration_sessions", "(owner_id, created_at DESC) WHERE classroom_id IS NULL"),
                    
                    # CollaborationParticipant indexes
                    ("idx_collaboration_participant_session_status", "collaboration_participants", "(session_id, status)"),
                    ("idx_collaboration_participant_user_connected", "collaboration_participants", "(user_id, is_connected)"),
                    ("idx_collaboration_participant_joined_desc", "collaboration_participants", "(joined_at DESC)"),
                    
                    # Template indexes
                    ("idx_template_classroom_active", "templates", "(classroom_id, is_active)"),
                    ("idx_template_created_by_classroom", "templates", "(created_by, classroom_id)"),
                    
                    # AdminSettings indexes
                    ("idx_admin_settings_classroom_unique", "admin_settings", "(classroom_id)"),
                    
                    # User indexes - Optimized for admin user queries
                    ("idx_user_active_role", "users", "(is_active, role)"),
                    ("idx_user_created_desc", "users", "(created_at DESC)"),
                    ("idx_user_search_composite", "users", "(username, email, full_name)"),
                    ("idx_user_email_lower", "users", "(lower(email))"),
                ]
                
                # Create regular indexes
                for index_name, table_name, columns in performance_indexes:
                    self._create_index_safely(connection, index_name, table_name, columns)
                
                # Create partial indexes (more efficient for common queries)
                partial_indexes = [
                    ("idx_active_user_classroom", "user_classrooms", "(classroom_id, user_id)", "is_active = true"),
                    ("idx_successful_executions", "code_submissions", "(created_at DESC, user_id, classroom_id)", "status = 'success'"),
                    ("idx_error_executions", "code_submissions", "(created_at DESC, classroom_id)", "status = 'error'"),
                    ("idx_active_sessions", "collaboration_sessions", "(owner_id, created_at DESC)", "is_active = true"),
                    ("idx_recent_executions", "code_submissions", "(created_at DESC, user_id)", "created_at >= CURRENT_DATE - INTERVAL '30 days'"),
                    ("idx_active_templates", "templates", "(classroom_id, name, language)", "is_active = true"),
                ]
                
                # Create partial indexes
                for index_name, table_name, columns, where_clause in partial_indexes:
                    self._create_index_safely(connection, index_name, table_name, columns, where_clause)
                
                # Apply PostgreSQL-specific optimizations for Railway.app
                railway_optimizations = [
                    # Increase statistics target for better query plans
                    "ALTER TABLE code_submissions ALTER COLUMN created_at SET STATISTICS 1000",
                    "ALTER TABLE collaboration_sessions ALTER COLUMN created_at SET STATISTICS 1000", 
                    "ALTER TABLE user_classrooms ALTER COLUMN classroom_id SET STATISTICS 1000",
                    "ALTER TABLE users ALTER COLUMN created_at SET STATISTICS 1000",
                    
                    # Set fill factor for tables with frequent updates
                    "ALTER TABLE user_classrooms SET (fillfactor = 90)",
                    "ALTER TABLE collaboration_sessions SET (fillfactor = 90)",
                ]
                
                for optimization in railway_optimizations:
                    try:
                        connection.execute(text(optimization))
                        logger.info(f"Applied optimization: {optimization[:50]}...")
                    except Exception as e:
                        logger.warning(f"Could not apply optimization {optimization[:30]}...: {e}")
                
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

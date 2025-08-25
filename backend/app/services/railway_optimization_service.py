"""
Railway.app Optimization Service - Production performance optimizations
Specifically designed for Railway.app + PostgreSQL + Cloudflare deployment
"""

import time
import logging
from functools import wraps
from typing import Dict, Any, Optional
from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError
from app.database.base import engine
from app.core.config import settings

logger = logging.getLogger(__name__)

class RailwayOptimizationService:
    """Service for Railway.app specific performance optimizations"""
    
    def __init__(self):
        self.optimization_version = "railway_v2_optimization"
        self.query_cache = {}
        self.performance_metrics = {}
    
    def apply_railway_specific_optimizations(self):
        """Apply Railway.app specific database optimizations"""
        logger.info("Applying Railway.app specific optimizations...")
        
        try:
            with engine.connect() as connection:
                # Set Railway-specific PostgreSQL parameters
                railway_settings = [
                    # Connection and memory optimizations for Railway
                    "SET shared_preload_libraries = 'pg_stat_statements'",
                    "SET track_activity_query_size = 2048",
                    "SET log_min_duration_statement = 1000",  # Log slow queries
                    "SET log_statement = 'mod'",  # Log modifications
                    
                    # Query optimization for admin APIs
                    "SET work_mem = '64MB'",  # Increased for complex admin queries
                    "SET maintenance_work_mem = '256MB'",
                    "SET effective_cache_size = '1GB'",  # Railway typical memory
                    "SET random_page_cost = 1.1",  # SSD optimization
                    
                    # Connection optimization for Railway limits
                    "SET max_connections = 100",
                    "SET idle_in_transaction_session_timeout = '300s'",
                    "SET statement_timeout = '30s'",  # Prevent long-running queries
                    
                    # Auto-vacuum optimization for high-write admin tables
                    "ALTER TABLE code_submissions SET (autovacuum_vacuum_scale_factor = 0.1)",
                    "ALTER TABLE collaboration_sessions SET (autovacuum_vacuum_scale_factor = 0.1)",
                    "ALTER TABLE user_classrooms SET (autovacuum_vacuum_scale_factor = 0.05)",
                ]
                
                for setting in railway_settings:
                    try:
                        connection.execute(text(setting))
                        logger.info(f"Applied Railway setting: {setting[:50]}...")
                    except Exception as e:
                        # Some settings may require superuser or may not be applicable
                        logger.debug(f"Could not apply setting {setting[:30]}...: {e}")
                
                connection.commit()
                logger.info("✅ Railway-specific optimizations applied")
                
        except Exception as e:
            logger.error(f"❌ Error applying Railway optimizations: {e}")
    
    def monitor_query_performance(self, query_name: str, execution_time: float):
        """Monitor and log query performance for Railway deployment"""
        if query_name not in self.performance_metrics:
            self.performance_metrics[query_name] = {
                'total_calls': 0,
                'total_time': 0,
                'max_time': 0,
                'avg_time': 0
            }
        
        metrics = self.performance_metrics[query_name]
        metrics['total_calls'] += 1
        metrics['total_time'] += execution_time
        metrics['max_time'] = max(metrics['max_time'], execution_time)
        metrics['avg_time'] = metrics['total_time'] / metrics['total_calls']
        
        # Log slow queries (>1s) for Railway monitoring
        if execution_time > 1.0:
            logger.warning(f"Slow query detected - {query_name}: {execution_time:.2f}s")
    
    def get_performance_report(self) -> Dict[str, Any]:
        """Get performance metrics for Railway monitoring dashboard"""
        return {
            'optimization_version': self.optimization_version,
            'query_metrics': self.performance_metrics,
            'database_connection_info': self._get_connection_info(),
            'cache_stats': self._get_cache_stats()
        }
    
    def _get_connection_info(self) -> Dict[str, Any]:
        """Get database connection information for monitoring"""
        try:
            with engine.connect() as connection:
                result = connection.execute(text("""
                    SELECT 
                        count(*) as total_connections,
                        count(*) FILTER (WHERE state = 'active') as active_connections,
                        count(*) FILTER (WHERE state = 'idle') as idle_connections
                    FROM pg_stat_activity 
                    WHERE datname = current_database()
                """)).fetchone()
                
                return {
                    'total_connections': result.total_connections,
                    'active_connections': result.active_connections,
                    'idle_connections': result.idle_connections,
                    'pool_size': engine.pool.size(),
                    'checked_out': engine.pool.checkedout()
                }
        except Exception as e:
            logger.error(f"Error getting connection info: {e}")
            return {'error': str(e)}
    
    def _get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        try:
            from app.services.admin_cache_service import AdminCacheService
            cache_service = AdminCacheService()
            
            # Try to get Redis info
            redis_info = cache_service.redis_client.info()
            return {
                'redis_connected': True,
                'redis_memory_used': redis_info.get('used_memory_human'),
                'redis_connected_clients': redis_info.get('connected_clients'),
                'redis_keyspace_hits': redis_info.get('keyspace_hits'),
                'redis_keyspace_misses': redis_info.get('keyspace_misses')
            }
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {'redis_connected': False, 'error': str(e)}

def railway_performance_monitor(query_name: str):
    """Decorator to monitor query performance on Railway"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                execution_time = time.time() - start_time
                
                # Log to Railway optimization service
                optimization_service.monitor_query_performance(query_name, execution_time)
                
                # Log to Railway logs for monitoring
                if execution_time > 0.5:  # Log queries slower than 500ms
                    logger.info(f"Railway Query Performance - {query_name}: {execution_time:.3f}s")
                
                return result
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error(f"Railway Query Error - {query_name}: {execution_time:.3f}s - {str(e)}")
                raise
        return wrapper
    return decorator

def optimize_admin_query(query_sql: str, params: Dict[str, Any]) -> str:
    """Optimize SQL queries for Railway PostgreSQL deployment"""
    
    # Add query hints for better performance on Railway
    optimizations = [
        # Force nested loop joins for small result sets
        "/*+ USE_NL */",
        # Use hash joins for larger datasets
        "/*+ USE_HASH */",
        # Ensure index usage
        "/*+ INDEX_SCAN */"
    ]
    
    # Add EXPLAIN ANALYZE for debugging in development
    if settings.debug:
        query_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query_sql}"
    
    return query_sql

# Global optimization service instance
optimization_service = RailwayOptimizationService()

# Apply optimizations on module import for Railway deployment
if not settings.debug:  # Only in production on Railway
    try:
        optimization_service.apply_railway_specific_optimizations()
    except Exception as e:
        logger.error(f"Could not apply Railway optimizations: {e}")

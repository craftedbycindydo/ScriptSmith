"""
Admin Cache Service - High-performance caching for admin APIs
Optimized for Railway.app deployment with Redis
"""

import json
import redis
from typing import Optional, List, Dict, Any
from functools import wraps
from app.core.config import settings
import hashlib
import pickle
import logging

logger = logging.getLogger(__name__)

class AdminCacheService:
    """Redis-based caching service for admin API performance optimization"""
    
    def __init__(self):
        self.redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            max_connections=20  # Connection pooling for performance
        )
        self.default_ttl = 300  # 5 minutes default cache
        self.stats_ttl = 60     # 1 minute for stats (frequently changing)
        self.user_list_ttl = 180 # 3 minutes for user lists
        
    def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a consistent cache key from arguments"""
        # Create a hash from all arguments for consistent keys
        key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
        key_hash = hashlib.md5(key_data.encode()).hexdigest()
        return f"admin_cache:{prefix}:{key_hash}"
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached data with error handling"""
        try:
            cached_data = self.redis_client.get(key)
            if cached_data:
                # Try JSON first, fallback to pickle for complex objects
                try:
                    return json.loads(cached_data)
                except (json.JSONDecodeError, TypeError):
                    return pickle.loads(cached_data.encode('latin1'))
            return None
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set cached data with error handling"""
        try:
            ttl = ttl or self.default_ttl
            
            # Try JSON first for simple data structures
            try:
                serialized_value = json.dumps(value, default=str)
            except (TypeError, ValueError):
                # Fallback to pickle for complex objects
                serialized_value = pickle.dumps(value).decode('latin1')
            
            return self.redis_client.setex(key, ttl, serialized_value)
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")
            return False
    
    def delete(self, pattern: str) -> int:
        """Delete cache entries matching pattern"""
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.warning(f"Cache delete error for pattern {pattern}: {e}")
            return 0
    
    def invalidate_user_caches(self, user_id: int = None):
        """Invalidate user-related caches"""
        patterns = [
            "admin_cache:user_list:*",
            "admin_cache:classroom_users:*",
        ]
        if user_id:
            patterns.append(f"admin_cache:user_details:{user_id}:*")
        
        for pattern in patterns:
            self.delete(pattern)
    
    def invalidate_stats_caches(self, classroom_id: int = None):
        """Invalidate statistics caches"""
        patterns = [
            "admin_cache:stats:*",
            "admin_cache:activities:*",
            "admin_cache:executions:*",
        ]
        if classroom_id:
            patterns.append(f"admin_cache:classroom_stats:{classroom_id}:*")
        
        for pattern in patterns:
            self.delete(pattern)

# Cache decorator for admin functions
def cache_admin_result(cache_prefix: str, ttl: int = None):
    """Decorator to cache admin API results"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_service = AdminCacheService()
            
            # Generate cache key from function arguments
            cache_key = cache_service._generate_cache_key(cache_prefix, *args, **kwargs)
            
            # Try to get from cache first
            cached_result = cache_service.get(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for {cache_prefix}: {cache_key}")
                return cached_result
            
            # Execute function and cache result
            try:
                result = await func(*args, **kwargs)
                cache_service.set(cache_key, result, ttl)
                logger.debug(f"Cache set for {cache_prefix}: {cache_key}")
                return result
            except Exception as e:
                logger.error(f"Error in cached function {func.__name__}: {e}")
                raise
                
        return wrapper
    return decorator

# Specific caching methods for admin endpoints
class AdminEndpointCache:
    """Pre-built caching methods for specific admin endpoints"""
    
    def __init__(self):
        self.cache = AdminCacheService()
    
    def cache_classroom_users(self, classroom_id: int, users: List[Dict]) -> bool:
        """Cache classroom users list"""
        key = f"admin_cache:classroom_users:{classroom_id}"
        return self.cache.set(key, users, ttl=self.cache.user_list_ttl)
    
    def get_cached_classroom_users(self, classroom_id: int) -> Optional[List[Dict]]:
        """Get cached classroom users"""
        key = f"admin_cache:classroom_users:{classroom_id}"
        return self.cache.get(key)
    
    def cache_admin_stats(self, classroom_ids: List[int], stats: Dict) -> bool:
        """Cache admin statistics"""
        key_suffix = hashlib.md5(str(sorted(classroom_ids)).encode()).hexdigest()
        key = f"admin_cache:stats:{key_suffix}"
        return self.cache.set(key, stats, ttl=self.cache.stats_ttl)
    
    def get_cached_admin_stats(self, classroom_ids: List[int]) -> Optional[Dict]:
        """Get cached admin statistics"""
        key_suffix = hashlib.md5(str(sorted(classroom_ids)).encode()).hexdigest()
        key = f"admin_cache:stats:{key_suffix}"
        return self.cache.get(key)
    
    def cache_user_activities(self, filters: Dict, activities: Dict) -> bool:
        """Cache user activities with filters"""
        key_suffix = hashlib.md5(str(sorted(filters.items())).encode()).hexdigest()
        key = f"admin_cache:activities:{key_suffix}"
        return self.cache.set(key, activities, ttl=120)  # 2 minutes for activities
    
    def get_cached_user_activities(self, filters: Dict) -> Optional[Dict]:
        """Get cached user activities"""
        key_suffix = hashlib.md5(str(sorted(filters.items())).encode()).hexdigest()
        key = f"admin_cache:activities:{key_suffix}"
        return self.cache.get(key)

# Global instance
admin_cache = AdminEndpointCache()

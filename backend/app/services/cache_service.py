"""
Redis cache service for code execution results
"""

import redis
import json
import hashlib
from typing import Dict, Any, Optional
from app.core.config import settings
import asyncio
from functools import wraps


class CacheService:
    """
    Redis cache service for code execution results with sliding expiration
    
    Features:
    - Caches code execution results and OpenAI complexity analysis
    - 48-hour TTL with sliding expiration (resets on every access)
    - Frequently accessed code stays cached longer
    - SHA-256 cache keys based on code+language+input
    - Failed executions cached without complexity analysis (saves OpenAI costs)
    - Thread-safe cache operations to prevent race conditions
    """
    
    def __init__(self):
        self.redis_client = None
        self._cache_locks = {}  # Cache key -> asyncio.Lock for preventing race conditions
        self._initialize_redis()
        
    def _initialize_redis(self):
        """Initialize Redis connection"""
        try:
            # Parse Redis URL and create connection
            self.redis_client = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            self.redis_client.ping()
            print("✅ Redis cache service initialized successfully")
        except Exception as e:
            print(f"⚠️  Redis connection failed: {e}")
            self.redis_client = None
    
    def _generate_cache_key(self, code: str, language: str, input_data: str = "") -> str:
        """
        Generate a unique cache key based on EXACT code content, language, and input
        
        BIT-PERFECT CACHING: No normalization whatsoever to ensure exact code gets exact results
        
        Args:
            code: The source code (used exactly as provided)
            language: Programming language
            input_data: Input data for the code (used exactly as provided)
            
        Returns:
            SHA-256 hash as cache key
        """
        # NO NORMALIZATION - use exact code and input for bit-perfect caching
        # Even a single character difference should produce different cache keys
        cache_content = f"{language}:{input_data}:{code}"
        
        # Generate SHA-256 hash for consistent, unique key
        cache_key = f"code_exec:{hashlib.sha256(cache_content.encode('utf-8')).hexdigest()}"
        
        # Store the original content hash for validation (paranoid security)
        content_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
        return f"{cache_key}:{content_hash[:8]}"
    
    def _get_cache_lock(self, cache_key: str) -> asyncio.Lock:
        """Get or create an asyncio lock for a specific cache key to prevent race conditions"""
        if cache_key not in self._cache_locks:
            self._cache_locks[cache_key] = asyncio.Lock()
        return self._cache_locks[cache_key]
    
    async def get_cached_result(self, code: str, language: str, input_data: str = "") -> Optional[Dict[str, Any]]:
        """
        Get cached execution result and reset TTL to 48 hours (sliding expiration)
        Thread-safe to prevent race conditions.
        
        Args:
            code: The source code
            language: Programming language  
            input_data: Input data for the code
            
        Returns:
            Cached result dictionary or None if not found
        """
        if not self.redis_client:
            return None
            
        cache_key = self._generate_cache_key(code, language, input_data)
        lock = self._get_cache_lock(cache_key)
        
        async with lock:
            try:
                # Run Redis operation in thread pool to avoid blocking
                cached_data = await asyncio.get_event_loop().run_in_executor(
                    None, self.redis_client.get, cache_key
                )
                
            if cached_data:
                result = json.loads(cached_data)
                
                # PARANOID VALIDATION: Verify cached code matches requested code
                cached_code_hash = result.get("code_hash")
                requested_code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
                
                if cached_code_hash != requested_code_hash:
                    print(f"🚨 CACHE CORRUPTION DETECTED! Cached code hash {cached_code_hash[:8]}... != requested {requested_code_hash[:8]}...")
                    # Delete corrupted cache entry
                    await asyncio.get_event_loop().run_in_executor(
                        None, self.redis_client.delete, cache_key
                    )
                    return None  # Force fresh execution
                
                # Reset TTL to 48 hours (sliding expiration)
                cache_ttl = 48 * 60 * 60
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.redis_client.expire(cache_key, cache_ttl)
                )
                
                print(f"🎯 Cache HIT for {language} code ({cache_key[:16]}...) - TTL reset to 48h")
                return result
            else:
                print(f"🔍 Cache MISS for {language} code ({cache_key[:16]}...)")
                return None
                    
        except Exception as e:
            print(f"⚠️  Cache read error: {e}")
            return None
    
    async def cache_result(
        self, 
        code: str, 
        language: str, 
        input_data: str, 
        execution_result: Dict[str, Any]
    ) -> bool:
        """
        Cache execution result for 48 hours
        Thread-safe to prevent race conditions.
        
        Args:
            code: The source code
            language: Programming language
            input_data: Input data for the code
            execution_result: The execution result to cache
            
        Returns:
            True if cached successfully, False otherwise
        """
        if not self.redis_client:
            return False
            
        cache_key = self._generate_cache_key(code, language, input_data)
        lock = self._get_cache_lock(cache_key)
        
        async with lock:
            try:
                # Check if key already exists to prevent overwriting
                existing_data = await asyncio.get_event_loop().run_in_executor(
                    None, self.redis_client.get, cache_key
                )
                
                if existing_data:
                    print(f"⚠️  Cache key already exists, skipping write ({cache_key[:16]}...)")
                    return True  # Already cached, consider it successful
                
                # Prepare data for caching
                cache_data = {
                    "output": execution_result.get("output", ""),
                    "error": execution_result.get("error", ""),
                    "execution_time": execution_result.get("execution_time", 0.0),
                    "status": execution_result.get("status", "error"),
                    "complexity": execution_result.get("complexity"),  # Will be None for failed executions
                    "cached_at": asyncio.get_event_loop().time(),
                    "language": language,
                    "code_hash": hashlib.sha256(code.encode('utf-8')).hexdigest()  # For validation
                }
                
                # Cache for 48 hours (172800 seconds)
                cache_ttl = 48 * 60 * 60
                
                # Run Redis operation in thread pool to avoid blocking
                await asyncio.get_event_loop().run_in_executor(
                    None, 
                    lambda: self.redis_client.setex(
                        cache_key, 
                        cache_ttl, 
                        json.dumps(cache_data, default=str)
                    )
                )
                
                print(f"💾 Cached {language} result for 48h ({cache_key[:16]}...)")
                return True
                
            except Exception as e:
                print(f"⚠️  Cache write error: {e}")
                return False
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.redis_client:
            return {"error": "Redis not available"}
            
        try:
            # Get cache statistics
            info = await asyncio.get_event_loop().run_in_executor(
                None, self.redis_client.info, "keyspace"
            )
            
            # Count code execution cache keys
            code_keys = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.keys("code_exec:*")
            )
            
            return {
                "total_code_cache_entries": len(code_keys),
                "redis_info": info,
                "redis_connected": True,
                "cache_type": "sliding_expiration",
                "cache_ttl_hours": 48,
                "note": "TTL resets to 48h on every cache hit"
            }
            
        except Exception as e:
            return {
                "error": f"Failed to get cache stats: {e}",
                "redis_connected": False
            }
    
    async def get_cache_ttl(self, code: str, language: str, input_data: str = "") -> int:
        """
        Get remaining TTL for cached code execution result
        
        Args:
            code: The source code
            language: Programming language
            input_data: Input data for the code
            
        Returns:
            Remaining TTL in seconds, -1 if key doesn't exist, -2 if no TTL set
        """
        if not self.redis_client:
            return -1
            
        try:
            cache_key = self._generate_cache_key(code, language, input_data)
            
            ttl = await asyncio.get_event_loop().run_in_executor(
                None, self.redis_client.ttl, cache_key
            )
            
            return ttl
            
        except Exception as e:
            print(f"⚠️  TTL check error: {e}")
            return -1
    
    async def clear_cache(self, pattern: str = "code_exec:*") -> int:
        """
        Clear cache entries matching pattern and clean up associated locks
        
        Args:
            pattern: Redis key pattern (default: all code execution cache)
            
        Returns:
            Number of keys deleted
        """
        if not self.redis_client:
            return 0
            
        try:
            keys = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.keys(pattern)
            )
            
            if keys:
                deleted = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.redis_client.delete(*keys)
                )
                
                # Clean up associated locks to prevent memory leaks
                for key in keys:
                    if key in self._cache_locks:
                        del self._cache_locks[key]
                
                print(f"🗑️  Cleared {deleted} cache entries and {len(keys)} locks")
                return deleted
            
            return 0
            
        except Exception as e:
            print(f"⚠️  Cache clear error: {e}")
            return 0
    
    def cleanup_unused_locks(self, max_locks: int = 1000):
        """
        Clean up unused cache locks to prevent memory leaks
        Keeps only the most recently used locks up to max_locks
        """
        if len(self._cache_locks) > max_locks:
            # Keep only the most recent max_locks entries
            # Since we can't track usage easily, just keep the first max_locks
            keys_to_remove = list(self._cache_locks.keys())[max_locks:]
            for key in keys_to_remove:
                del self._cache_locks[key]
            print(f"🧹 Cleaned up {len(keys_to_remove)} unused cache locks")


# Create global cache service instance
cache_service = CacheService()

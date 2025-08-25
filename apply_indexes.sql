-- PostgreSQL-Optimized Indexes for Admin Performance 
-- Designed for PostgreSQL-specific queries with array operations and window functions

-- 1. CRITICAL: User-Classroom lookups with array support
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_classrooms_array_lookup 
ON user_classrooms (classroom_id, user_id, is_active) WHERE is_active = true;

-- 2. CRITICAL: Code submissions with PostgreSQL array filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_classroom_array 
ON code_submissions (classroom_id, user_id, created_at DESC, status, language);

-- 3. Code submissions for window function queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_user_window 
ON code_submissions (user_id, created_at DESC, status) WHERE status IS NOT NULL;

-- 4. Collaboration sessions for array operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collaboration_sessions_array 
ON collaboration_sessions (classroom_id, owner_id, is_active, created_at DESC);

-- 5. User search with PostgreSQL text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_text_search 
ON users USING gin(to_tsvector('english', username || ' ' || email || ' ' || COALESCE(full_name, '')));

-- Additional PostgreSQL-specific index for faster text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_ilike_search 
ON users (lower(username), lower(email), lower(full_name), created_at DESC);

-- 6. Language statistics with JSONB aggregation support
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_language_jsonb 
ON code_submissions (language, classroom_id, created_at) WHERE language IS NOT NULL;

-- 7. Multi-column index for admin stats query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_stats_compound 
ON code_submissions (classroom_id, user_id, status, language, created_at);

-- 8. Collaboration sessions compound index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collaboration_compound 
ON collaboration_sessions (classroom_id, owner_id, is_active, created_at);

-- PostgreSQL-specific optimizations
-- Enable better statistics for array operations
ALTER TABLE user_classrooms ALTER COLUMN classroom_id SET STATISTICS 1000;
ALTER TABLE code_submissions ALTER COLUMN classroom_id SET STATISTICS 1000;
ALTER TABLE collaboration_sessions ALTER COLUMN classroom_id SET STATISTICS 1000;

-- Update table statistics immediately
ANALYZE user_classrooms;
ANALYZE code_submissions;
ANALYZE collaboration_sessions;
ANALYZE users;

-- PERFORMANCE NOTE: Admin queries have been optimized to avoid:
-- 1. SELECT * (replaced with specific columns)
-- 2. COUNT(*) (replaced with COUNT(primary_key) or pg_class.reltuples)
-- 3. Complex CTEs (replaced with efficient JOINs and FILTER clauses)
-- 4. SQLite patterns (replaced with PostgreSQL-specific optimizations)

-- Check index creation status
SELECT 
    schemaname,
    tablename, 
    indexname,
    indexdef
FROM pg_indexes 
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

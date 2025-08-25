-- ESSENTIAL INDEXES ONLY - No tech debt
-- Based on actual admin query patterns

-- 1. User Classrooms (Most critical - used in every admin query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_classrooms_lookup 
ON user_classrooms (classroom_id, user_id) WHERE is_active = true;

-- 2. Code Submissions by User (Heavy in stats/users queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_user_time 
ON code_submissions (user_id, created_at DESC);

-- 3. Code Submissions by Classroom (Used in classroom scoping)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_classroom_time 
ON code_submissions (classroom_id, created_at DESC);

-- 4. Collaboration Sessions by Owner (For user stats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collaboration_sessions_owner 
ON collaboration_sessions (owner_id, is_active);

-- 5. User Search (For admin user searches)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_search 
ON users (username, email, created_at DESC);

-- 6. Language Stats (For popular languages query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_code_submissions_language 
ON code_submissions (language, classroom_id) WHERE language IS NOT NULL;

-- That's it! Just 6 essential indexes, no over-engineering.

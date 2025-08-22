-- Production Database Migration Script
-- Generated based on model changes for classroom multi-tenancy support
-- Run these statements in order on your production database

-- =====================================================
-- Step 1: Create new tables
-- =====================================================

-- Create classrooms table
CREATE TABLE classrooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    classroom_key VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    max_members INTEGER DEFAULT 0,
    allow_collaboration BOOLEAN NOT NULL DEFAULT true
);

-- Create indexes for classrooms
CREATE INDEX idx_classrooms_name ON classrooms(name);
CREATE INDEX idx_classrooms_classroom_key ON classrooms(classroom_key);

-- Create user_classrooms table (many-to-many relationship)
CREATE TABLE user_classrooms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
    role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_accessed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT _user_classroom_uc UNIQUE (user_id, classroom_id)
);

-- Create template_classrooms association table
CREATE TABLE template_classrooms (
    template_id INTEGER NOT NULL REFERENCES templates(id),
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (template_id, classroom_id)
);

-- =====================================================
-- Step 2: Add new columns to existing tables
-- =====================================================

-- Add classroom_id to admin_settings table (nullable for backwards compatibility)
ALTER TABLE admin_settings 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);

-- Add unique constraint for admin_settings classroom relationship
ALTER TABLE admin_settings 
ADD CONSTRAINT admin_settings_classroom_unique UNIQUE (classroom_id);

-- Add classroom_id to assignments table (nullable for backwards compatibility)
ALTER TABLE assignments 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);

-- Add classroom_id to code_submissions table (nullable for backwards compatibility)
ALTER TABLE code_submissions 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);

-- Add classroom_id to collaboration_sessions table (nullable for backwards compatibility)
ALTER TABLE collaboration_sessions 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);

-- Add new fields to templates table (all nullable for backwards compatibility)
ALTER TABLE templates 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id),
ADD COLUMN submission_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN exclusions JSON;

-- Add classroom_id to user_templates table (nullable for backwards compatibility)
ALTER TABLE user_templates 
ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);

-- =====================================================
-- Step 3: Add user role enum and update users table
-- =====================================================

-- Create user role enum type
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');

-- Add role column to users table
ALTER TABLE users 
ADD COLUMN role user_role NOT NULL DEFAULT 'user';

-- Note: You may need to update existing admin users manually based on your current setup
-- Example (run separately if needed): UPDATE users SET role = 'admin' WHERE is_superuser = true;

-- =====================================================
-- Step 4: Update trigger functions for updated_at columns
-- =====================================================

-- Create or update the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for new tables
CREATE TRIGGER update_classrooms_updated_at BEFORE UPDATE ON classrooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Step 5: Create indexes for performance
-- =====================================================

-- Indexes for foreign key columns
CREATE INDEX idx_admin_settings_classroom_id ON admin_settings(classroom_id);
CREATE INDEX idx_assignments_classroom_id ON assignments(classroom_id);
CREATE INDEX idx_code_submissions_classroom_id ON code_submissions(classroom_id);
CREATE INDEX idx_collaboration_sessions_classroom_id ON collaboration_sessions(classroom_id);
CREATE INDEX idx_templates_classroom_id ON templates(classroom_id);
CREATE INDEX idx_user_templates_classroom_id ON user_templates(classroom_id);

-- Indexes for user_classrooms
CREATE INDEX idx_user_classrooms_user_id ON user_classrooms(user_id);
CREATE INDEX idx_user_classrooms_classroom_id ON user_classrooms(classroom_id);
CREATE INDEX idx_user_classrooms_role ON user_classrooms(role);

-- =====================================================
-- Step 6: Backwards Compatibility Verification
-- =====================================================

-- Verify all new columns are nullable or have defaults
-- This ensures existing applications continue to work

-- Backwards compatibility checks:
-- ✓ classroom_id columns: ALL NULLABLE (existing records won't break)
-- ✓ user.role column: Has DEFAULT 'user' (existing users get default role)
-- ✓ New tables: Don't affect existing functionality
-- ✓ Foreign keys: Reference existing tables safely
-- ✓ Indexes: Performance improvement, no breaking changes

-- =====================================================
-- Backwards Compatibility Notes:
-- =====================================================
-- 1. CRITICAL: Backup your database before running these statements
-- 2. CRITICAL: Test these statements on a staging environment first
-- 3. All new classroom_id columns are NULLABLE for backwards compatibility
-- 4. All new columns have appropriate defaults where needed
-- 5. Existing data will remain unchanged and accessible
-- 6. No sample/mock data is inserted - existing application functionality preserved
-- 7. Foreign key constraints are added without breaking existing records
-- 8. Consider running ANALYZE after the migration to update query planner statistics
-- 9. Monitor application logs after deployment for any issues

-- =====================================================
-- Pre-Migration Safety Check (Optional)
-- =====================================================
-- Run these queries to verify current database state before migration:
-- SELECT COUNT(*) FROM users; -- Count existing users
-- SELECT COUNT(*) FROM templates; -- Count existing templates  
-- SELECT COUNT(*) FROM admin_settings; -- Count existing admin settings

-- =====================================================
-- Post-Migration Verification (Optional)
-- =====================================================
-- After running the migration, verify with these queries:
-- SELECT table_name, column_name, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name IN ('admin_settings', 'assignments', 'code_submissions', 'collaboration_sessions', 'templates', 'user_templates')
-- AND column_name = 'classroom_id';

-- Run this migration during low-traffic hours to minimize impact
COMMIT;

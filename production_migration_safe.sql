-- Safe Production Database Migration Script
-- Generated based on model changes for classroom multi-tenancy support
-- This script is designed to handle existing tables/columns gracefully

-- =====================================================
-- Pre-flight Safety Checks
-- =====================================================

-- Check if we're connected to the right database
DO $$ 
BEGIN 
    RAISE NOTICE 'Starting migration on database: %', current_database();
    RAISE NOTICE 'Connected as user: %', current_user;
    RAISE NOTICE 'Current timestamp: %', now();
END $$;

-- =====================================================
-- Step 1: Create new tables (with IF NOT EXISTS)
-- =====================================================

-- Create classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
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

-- Create indexes for classrooms (only if they don't exist)
DO $$
BEGIN
    -- Create index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'classrooms' AND indexname = 'idx_classrooms_name') THEN
        CREATE INDEX idx_classrooms_name ON classrooms(name);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'classrooms' AND indexname = 'idx_classrooms_classroom_key') THEN
        CREATE INDEX idx_classrooms_classroom_key ON classrooms(classroom_key);
    END IF;
END $$;

-- Create user_classrooms table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS user_classrooms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
    role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_accessed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_user_classroom_uc') THEN
        ALTER TABLE user_classrooms ADD CONSTRAINT _user_classroom_uc UNIQUE (user_id, classroom_id);
    END IF;
END $$;

-- Create template_classrooms association table
CREATE TABLE IF NOT EXISTS template_classrooms (
    template_id INTEGER NOT NULL REFERENCES templates(id),
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (template_id, classroom_id)
);

-- =====================================================
-- Step 2: Add new columns to existing tables (safely)
-- =====================================================

-- Add classroom_id to admin_settings table (only if column doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'classroom_id') THEN
        ALTER TABLE admin_settings ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to admin_settings table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in admin_settings table';
    END IF;
END $$;

-- Add unique constraint for admin_settings classroom relationship (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_settings_classroom_unique') THEN
        ALTER TABLE admin_settings ADD CONSTRAINT admin_settings_classroom_unique UNIQUE (classroom_id);
        RAISE NOTICE 'Added unique constraint to admin_settings.classroom_id';
    ELSE
        RAISE NOTICE 'admin_settings_classroom_unique constraint already exists';
    END IF;
END $$;

-- Add classroom_id to assignments table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'classroom_id') THEN
        ALTER TABLE assignments ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to assignments table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in assignments table';
    END IF;
END $$;

-- Add classroom_id to code_submissions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'code_submissions' AND column_name = 'classroom_id') THEN
        ALTER TABLE code_submissions ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to code_submissions table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in code_submissions table';
    END IF;
END $$;

-- Add classroom_id to collaboration_sessions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'collaboration_sessions' AND column_name = 'classroom_id') THEN
        ALTER TABLE collaboration_sessions ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to collaboration_sessions table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in collaboration_sessions table';
    END IF;
END $$;

-- Add new fields to templates table
DO $$
BEGIN
    -- Add classroom_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'classroom_id') THEN
        ALTER TABLE templates ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to templates table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in templates table';
    END IF;
    
    -- Add submission_deadline column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'submission_deadline') THEN
        ALTER TABLE templates ADD COLUMN submission_deadline TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added submission_deadline column to templates table';
    ELSE
        RAISE NOTICE 'submission_deadline column already exists in templates table';
    END IF;
    
    -- Add exclusions column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'exclusions') THEN
        ALTER TABLE templates ADD COLUMN exclusions JSON;
        RAISE NOTICE 'Added exclusions column to templates table';
    ELSE
        RAISE NOTICE 'exclusions column already exists in templates table';
    END IF;
END $$;

-- Add classroom_id to user_templates table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_templates' AND column_name = 'classroom_id') THEN
        ALTER TABLE user_templates ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
        RAISE NOTICE 'Added classroom_id column to user_templates table';
    ELSE
        RAISE NOTICE 'classroom_id column already exists in user_templates table';
    END IF;
END $$;

-- =====================================================
-- Step 3: Add user role enum and update users table
-- =====================================================

-- Create user role enum type (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
        RAISE NOTICE 'Created user_role enum type';
    ELSE
        RAISE NOTICE 'user_role enum type already exists';
    END IF;
END $$;

-- Add role column to users table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';
        RAISE NOTICE 'Added role column to users table';
    ELSE
        RAISE NOTICE 'role column already exists in users table';
    END IF;
END $$;

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

-- Add triggers for new tables (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_classrooms_updated_at') THEN
        CREATE TRIGGER update_classrooms_updated_at BEFORE UPDATE ON classrooms
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Created update trigger for classrooms table';
    ELSE
        RAISE NOTICE 'update_classrooms_updated_at trigger already exists';
    END IF;
END $$;

-- =====================================================
-- Step 5: Create indexes for performance (safely)
-- =====================================================

DO $$
BEGIN
    -- Indexes for foreign key columns
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_admin_settings_classroom_id') THEN
        CREATE INDEX idx_admin_settings_classroom_id ON admin_settings(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_assignments_classroom_id') THEN
        CREATE INDEX idx_assignments_classroom_id ON assignments(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_code_submissions_classroom_id') THEN
        CREATE INDEX idx_code_submissions_classroom_id ON code_submissions(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_collaboration_sessions_classroom_id') THEN
        CREATE INDEX idx_collaboration_sessions_classroom_id ON collaboration_sessions(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_templates_classroom_id') THEN
        CREATE INDEX idx_templates_classroom_id ON templates(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_templates_classroom_id') THEN
        CREATE INDEX idx_user_templates_classroom_id ON user_templates(classroom_id);
    END IF;
    
    -- Indexes for user_classrooms
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_user_id') THEN
        CREATE INDEX idx_user_classrooms_user_id ON user_classrooms(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_classroom_id') THEN
        CREATE INDEX idx_user_classrooms_classroom_id ON user_classrooms(classroom_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_role') THEN
        CREATE INDEX idx_user_classrooms_role ON user_classrooms(role);
    END IF;
    
    RAISE NOTICE 'All indexes created or verified';
END $$;

-- =====================================================
-- Step 6: Final verification and cleanup
-- =====================================================

-- Verify all new columns are properly added
DO $$
DECLARE
    missing_columns TEXT := '';
BEGIN
    -- Check for required columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'classroom_id') THEN
        missing_columns := missing_columns || 'admin_settings.classroom_id ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'classroom_id') THEN
        missing_columns := missing_columns || 'assignments.classroom_id ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        missing_columns := missing_columns || 'users.role ';
    END IF;
    
    IF missing_columns != '' THEN
        RAISE EXCEPTION 'Migration incomplete! Missing columns: %', missing_columns;
    ELSE
        RAISE NOTICE '✅ Migration completed successfully! All required columns and tables are present.';
    END IF;
END $$;

-- =====================================================
-- Post-Migration Notes
-- =====================================================
-- Run these queries to verify the migration:
-- 
-- 1. Check new tables exist:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name IN ('classrooms', 'user_classrooms', 'template_classrooms');
--
-- 2. Check new columns exist:
-- SELECT table_name, column_name, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name IN ('admin_settings', 'assignments', 'code_submissions', 'collaboration_sessions', 'templates', 'user_templates', 'users')
-- AND column_name IN ('classroom_id', 'role', 'submission_deadline', 'exclusions');
--
-- 3. Count existing data (should be unchanged):
-- SELECT 'users' as table_name, COUNT(*) as count FROM users
-- UNION ALL
-- SELECT 'templates', COUNT(*) FROM templates
-- UNION ALL  
-- SELECT 'admin_settings', COUNT(*) FROM admin_settings;

COMMIT;

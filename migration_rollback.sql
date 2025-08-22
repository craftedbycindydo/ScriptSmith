-- Rollback Script for Classroom Multi-tenancy Migration
-- Use this script to undo the migration if needed
-- WARNING: This will remove all classroom-related data!

-- =====================================================
-- CRITICAL WARNING
-- =====================================================
-- This script will:
-- 1. Drop all classroom-related tables (losing all classroom data)
-- 2. Remove classroom_id columns from existing tables
-- 3. Remove user role enum and reset users to original structure
-- 
-- MAKE SURE YOU HAVE A BACKUP BEFORE RUNNING THIS!

-- =====================================================
-- Step 1: Remove foreign key columns (in reverse order)
-- =====================================================

-- Remove classroom_id from user_templates table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_templates' AND column_name = 'classroom_id') THEN
        ALTER TABLE user_templates DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from user_templates table';
    END IF;
END $$;

-- Remove new fields from templates table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'exclusions') THEN
        ALTER TABLE templates DROP COLUMN exclusions;
        RAISE NOTICE 'Removed exclusions column from templates table';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'submission_deadline') THEN
        ALTER TABLE templates DROP COLUMN submission_deadline;
        RAISE NOTICE 'Removed submission_deadline column from templates table';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'classroom_id') THEN
        ALTER TABLE templates DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from templates table';
    END IF;
END $$;

-- Remove classroom_id from collaboration_sessions table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'collaboration_sessions' AND column_name = 'classroom_id') THEN
        ALTER TABLE collaboration_sessions DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from collaboration_sessions table';
    END IF;
END $$;

-- Remove classroom_id from code_submissions table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'code_submissions' AND column_name = 'classroom_id') THEN
        ALTER TABLE code_submissions DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from code_submissions table';
    END IF;
END $$;

-- Remove classroom_id from assignments table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'classroom_id') THEN
        ALTER TABLE assignments DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from assignments table';
    END IF;
END $$;

-- Remove classroom_id from admin_settings table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_settings' AND column_name = 'classroom_id') THEN
        ALTER TABLE admin_settings DROP COLUMN classroom_id;
        RAISE NOTICE 'Removed classroom_id column from admin_settings table';
    END IF;
END $$;

-- =====================================================
-- Step 2: Drop classroom-related tables
-- =====================================================

-- Drop template_classrooms association table
DROP TABLE IF EXISTS template_classrooms;

-- Drop user_classrooms table
DROP TABLE IF EXISTS user_classrooms;

-- Drop classrooms table
DROP TABLE IF EXISTS classrooms;

-- =====================================================
-- Step 3: Remove user role enum and column
-- =====================================================

-- Remove role column from users table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users DROP COLUMN role;
        RAISE NOTICE 'Removed role column from users table';
    END IF;
END $$;

-- Drop user_role enum type
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        DROP TYPE user_role;
        RAISE NOTICE 'Dropped user_role enum type';
    END IF;
END $$;

-- =====================================================
-- Step 4: Clean up indexes and triggers
-- =====================================================

-- Drop indexes if they exist
DO $$
BEGIN
    -- Drop classroom-related indexes
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_admin_settings_classroom_id') THEN
        DROP INDEX idx_admin_settings_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_assignments_classroom_id') THEN
        DROP INDEX idx_assignments_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_code_submissions_classroom_id') THEN
        DROP INDEX idx_code_submissions_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_collaboration_sessions_classroom_id') THEN
        DROP INDEX idx_collaboration_sessions_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_templates_classroom_id') THEN
        DROP INDEX idx_templates_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_templates_classroom_id') THEN
        DROP INDEX idx_user_templates_classroom_id;
    END IF;
    
    -- Drop user_classrooms indexes
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_user_id') THEN
        DROP INDEX idx_user_classrooms_user_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_classroom_id') THEN
        DROP INDEX idx_user_classrooms_classroom_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_classrooms_role') THEN
        DROP INDEX idx_user_classrooms_role;
    END IF;
    
    -- Drop classrooms indexes
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classrooms_name') THEN
        DROP INDEX idx_classrooms_name;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classrooms_classroom_key') THEN
        DROP INDEX idx_classrooms_classroom_key;
    END IF;
    
    RAISE NOTICE 'Cleaned up all migration-related indexes';
END $$;

-- Drop triggers if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_classrooms_updated_at') THEN
        DROP TRIGGER update_classrooms_updated_at ON classrooms;
        RAISE NOTICE 'Dropped update trigger for classrooms table';
    END IF;
END $$;

-- =====================================================
-- Final verification
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Rollback completed successfully!';
    RAISE NOTICE 'Database has been restored to pre-migration state.';
    RAISE NOTICE 'All classroom-related tables, columns, and indexes have been removed.';
END $$;

COMMIT;

/**
 * MIGRATION: Complete Public Careers API Setup
 * 
 * Date: 2026-05-28
 * Description: 
 * - Add visibilityState (state machine: draft/internal_review/published/archived)
 * - Add searchVector (tsvector for PostgreSQL full-text search)
 * - Update indexes for optimal query performance
 * - Ensure backward compatibility with existing slug, is_public, published_at
 * 
 * Assumptions:
 * - job_openings table exists in module_c_rh schema
 * - uuid-ossp extension enabled (for uuid generation)
 * - pg_trgm extension enabled (for ILIKE fallback)
 */

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Add visibility_state column (state machine)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE module_c_rh.job_openings
ADD COLUMN IF NOT EXISTS visibility_state VARCHAR(30) DEFAULT 'draft';

-- Create constraint for valid visibility states
ALTER TABLE module_c_rh.job_openings
ADD CONSTRAINT check_visibility_state 
  CHECK (visibility_state IN ('draft', 'internal_review', 'published', 'archived'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Add searchVector column (PostgreSQL full-text search)
-- ───────────────────────────────────────────────────────────────────────────

-- Add tsvector column for full-text search
ALTER TABLE module_c_rh.job_openings
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate search_vector for existing jobs
UPDATE module_c_rh.job_openings
SET search_vector = to_tsvector('simple', 
  COALESCE(job_title, '') || ' ' || 
  COALESCE(job_description, '') || ' ' ||
  COALESCE(CAST(salary_range_min AS VARCHAR), '') || ' ' ||
  COALESCE(CAST(salary_range_max AS VARCHAR), '')
)
WHERE search_vector IS NULL;

-- Create GIN index on searchVector for fast full-text search
CREATE INDEX IF NOT EXISTS idx_job_openings_search_vector
ON module_c_rh.job_openings USING GIN(search_vector);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Create trigger to auto-update searchVector on job_title/job_description changes
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION module_c_rh.update_job_openings_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    COALESCE(NEW.job_title, '') || ' ' ||
    COALESCE(NEW.job_description, '') || ' ' ||
    COALESCE(CAST(NEW.salary_range_min AS VARCHAR), '') || ' ' ||
    COALESCE(CAST(NEW.salary_range_max AS VARCHAR), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (to avoid conflicts on re-runs)
DROP TRIGGER IF EXISTS trg_update_job_openings_search_vector 
ON module_c_rh.job_openings;

-- Create trigger
CREATE TRIGGER trg_update_job_openings_search_vector
BEFORE INSERT OR UPDATE ON module_c_rh.job_openings
FOR EACH ROW
EXECUTE FUNCTION module_c_rh.update_job_openings_search_vector();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Migrate existing data to new state model
-- ───────────────────────────────────────────────────────────────────────────

-- Published jobs → visibility_state = 'published'
UPDATE module_c_rh.job_openings
SET visibility_state = 'published'
WHERE status = 'published' 
  AND is_public = true
  AND visibility_state = 'draft';

-- Non-published jobs → visibility_state = 'draft'
UPDATE module_c_rh.job_openings
SET visibility_state = 'draft'
WHERE status IN ('draft', 'approved', 'interviewing', 'offer_pending', 'filled', 'cancelled')
  AND is_public = false
  AND visibility_state = 'draft';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Optimize indexes for public API queries
-- ───────────────────────────────────────────────────────────────────────────

-- Compound index for listing published jobs (most common query)
CREATE INDEX IF NOT EXISTS idx_job_openings_public_list
ON module_c_rh.job_openings(visibility_state, closing_date DESC, published_at DESC)
WHERE visibility_state = 'published' AND closing_date IS NOT NULL;

-- Unique slug index (already exists, but ensure it's present)
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_openings_slug
ON module_c_rh.job_openings(slug)
WHERE slug IS NOT NULL;

-- Index for status filtering (used by internal API)
CREATE INDEX IF NOT EXISTS idx_job_openings_status
ON module_c_rh.job_openings(status, organization_id)
WHERE status IS NOT NULL;

-- Index for department filtering
CREATE INDEX IF NOT EXISTS idx_job_openings_department
ON module_c_rh.job_openings(department_id)
WHERE visibility_state = 'published';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Add constraints for data integrity
-- ───────────────────────────────────────────────────────────────────────────

-- Ensure published jobs always have a slug
ALTER TABLE module_c_rh.job_openings
ADD CONSTRAINT check_published_has_slug
  CHECK (
    visibility_state != 'published' 
    OR (visibility_state = 'published' AND slug IS NOT NULL)
  );

-- Ensure published jobs have published_at timestamp
ALTER TABLE module_c_rh.job_openings
ADD CONSTRAINT check_published_has_timestamp
  CHECK (
    visibility_state != 'published'
    OR (visibility_state = 'published' AND published_at IS NOT NULL)
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Cleanup old migration artifacts (if any)
-- ───────────────────────────────────────────────────────────────────────────

-- Note: Keep is_public and slug columns for backward compatibility
-- These can be deprecated in a future migration

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Verify migration success
-- ───────────────────────────────────────────────────────────────────────────

-- Check column presence
SELECT 
  'Columns Status' as check_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'module_c_rh'
  AND table_name = 'job_openings'
  AND column_name IN ('visibility_state', 'search_vector', 'slug', 'is_public', 'published_at');

-- Check index creation
SELECT 
  'Indexes Status' as check_name,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'module_c_rh'
  AND tablename = 'job_openings'
  AND indexname IN (
    'idx_job_openings_search_vector',
    'idx_job_openings_public_list',
    'idx_job_openings_slug',
    'idx_job_openings_department'
  );

-- Check data migration
SELECT 
  'Data Migration Status' as check_name,
  COUNT(*) as total_jobs,
  SUM(CASE WHEN visibility_state = 'published' THEN 1 ELSE 0 END) as published_jobs,
  SUM(CASE WHEN slug IS NOT NULL THEN 1 ELSE 0 END) as jobs_with_slug,
  SUM(CASE WHEN search_vector IS NOT NULL THEN 1 ELSE 0 END) as jobs_with_search_vector
FROM module_c_rh.job_openings;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- Post-Migration Notes
-- ───────────────────────────────────────────────────────────────────────────
-- 
-- 1. ANALYZE TABLE: Run this after migration to update query planner statistics
--    ANALYZE module_c_rh.job_openings;
--
-- 2. MONITOR PERFORMANCE: Check slow queries for 24h after migration
--    SELECT * FROM pg_stat_statements WHERE query LIKE '%job_openings%';
--
-- 3. SEARCH VECTOR UPDATES: The trigger automatically updates search_vector
--    when job_title or job_description changes. No manual intervention needed.
--
-- 4. STATE TRANSITIONS: Ensure application logic enforces these rules:
--    - draft → internal_review (optional RH review)
--    - internal_review → published (approved by RH team)
--    - published → archived (soft-delete from public API)
--    - published → draft (unpublish if rejected during review)
--
-- ───────────────────────────────────────────────────────────────────────────

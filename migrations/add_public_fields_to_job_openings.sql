-- Migration: Add public career fields to job_openings table
-- Date: 2026-05-25
-- Description: Add slug, is_public, published_at columns for public careers API

BEGIN;

-- Add new columns
ALTER TABLE module_c_rh.job_openings 
ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP NULL;

-- Create indexes for public career API
CREATE INDEX IF NOT EXISTS idx_job_openings_public 
ON module_c_rh.job_openings(status, is_public, closing_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_openings_slug 
ON module_c_rh.job_openings(slug) 
WHERE slug IS NOT NULL;

-- Migrate existing published jobs to public if they have published status
UPDATE module_c_rh.job_openings 
SET is_public = true, 
    published_at = updated_at 
WHERE status = 'published' 
  AND is_public = false 
  AND published_at IS NULL;

COMMIT;

-- Verify migration
SELECT 'Migration complete. Summary:' as status;
SELECT 
  COUNT(*) as total_jobs,
  SUM(CASE WHEN is_public THEN 1 ELSE 0 END) as public_jobs,
  SUM(CASE WHEN slug IS NOT NULL THEN 1 ELSE 0 END) as jobs_with_slug
FROM module_c_rh.job_openings;

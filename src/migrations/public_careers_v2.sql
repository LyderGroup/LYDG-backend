-- Migration: Public Careers API v2 (multi-tenant + tracking + FTS + visibility)
-- Date: 2026-05-25
-- Description:
--   1. Visibility state machine sur job_openings (découplé du status RH)
--   2. Full-text search index (tsvector + GIN)
--   3. Multi-tenant + tracking sur job_applications (org_id, ip, ua, fingerprint, cv meta)
--   4. Snapshot des données du candidat sur l'application (RGPD + isolation org)

BEGIN;

-- ─── 1. JobOpening : Visibility State Machine ─────────────────────────────────
-- Découple la visibilité publique du status RH interne.
-- Valeurs: draft | internal_review | published | archived

ALTER TABLE module_c_rh.job_openings
  ADD COLUMN IF NOT EXISTS visibility_state VARCHAR(30) NOT NULL DEFAULT 'draft';

-- Backfill : tout job déjà is_public=true devient visibility_state='published'.
UPDATE module_c_rh.job_openings
SET visibility_state = 'published'
WHERE is_public = true AND visibility_state = 'draft';

-- Contrainte d'intégrité (échoue silencieusement si déjà présente)
DO $$
BEGIN
  ALTER TABLE module_c_rh.job_openings
    ADD CONSTRAINT job_openings_visibility_state_check
    CHECK (visibility_state IN ('draft', 'internal_review', 'published', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_openings_visibility
  ON module_c_rh.job_openings(visibility_state, closing_date)
  WHERE visibility_state = 'published';

-- ─── 2. Full-Text Search ──────────────────────────────────────────────────────
-- Colonne tsvector mise à jour automatiquement via trigger pour combiner
-- jobTitle + jobDescription. Index GIN pour requêtes rapides.

ALTER TABLE module_c_rh.job_openings
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Fonction de mise à jour du vecteur (utilise la config 'french' avec fallback)
CREATE OR REPLACE FUNCTION module_c_rh.job_openings_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.job_title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.job_description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_openings_search_vector ON module_c_rh.job_openings;
CREATE TRIGGER trg_job_openings_search_vector
  BEFORE INSERT OR UPDATE OF job_title, job_description
  ON module_c_rh.job_openings
  FOR EACH ROW EXECUTE FUNCTION module_c_rh.job_openings_search_vector_update();

-- Backfill du vecteur pour les lignes existantes
UPDATE module_c_rh.job_openings
SET search_vector =
  setweight(to_tsvector('simple', coalesce(job_title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(job_description, '')), 'B')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_openings_search_vector
  ON module_c_rh.job_openings USING GIN (search_vector);

-- ─── 3. JobApplication : Multi-tenant + tracking ──────────────────────────────
-- Chaque candidature appartient à l'organisation propriétaire de l'offre.
-- Les recruteurs d'une org ne voient QUE les candidatures de leurs offres.

ALTER TABLE module_c_rh.job_applications
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL,
  ADD COLUMN IF NOT EXISTS applicant_ip VARCHAR(45) NULL,
  ADD COLUMN IF NOT EXISTS applicant_user_agent TEXT NULL,
  ADD COLUMN IF NOT EXISTS applicant_device_fingerprint VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS applicant_full_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS applicant_email VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS applicant_phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS cv_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS cv_mime_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS cv_size_bytes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) NULL DEFAULT 'public_website';

-- Backfill organization_id depuis le jobOpening propriétaire
UPDATE module_c_rh.job_applications app
SET organization_id = jo.organization_id
FROM module_c_rh.job_openings jo
WHERE jo.id = app.job_opening_id
  AND app.organization_id IS NULL;

-- Backfill applicant_email/full_name/phone depuis Candidate pour les anciennes lignes
UPDATE module_c_rh.job_applications app
SET applicant_email = c.email,
    applicant_full_name = TRIM(CONCAT(c.first_name, ' ', c.last_name)),
    applicant_phone = c.phone
FROM module_c_rh.candidates c
WHERE c.id = app.candidate_id
  AND app.applicant_email IS NULL;

-- Index multi-tenant : recherches recruteur par org
CREATE INDEX IF NOT EXISTS idx_job_applications_org_date
  ON module_c_rh.job_applications(organization_id, application_date DESC)
  WHERE organization_id IS NOT NULL;

-- Index anti-doublon (un seul postulat par email/offre/org)
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_applications_email_job
  ON module_c_rh.job_applications(applicant_email, job_opening_id)
  WHERE applicant_email IS NOT NULL;

-- Index pour détection spam IP/fingerprint
CREATE INDEX IF NOT EXISTS idx_job_applications_ip_date
  ON module_c_rh.job_applications(applicant_ip, application_date DESC)
  WHERE applicant_ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_fingerprint_date
  ON module_c_rh.job_applications(applicant_device_fingerprint, application_date DESC)
  WHERE applicant_device_fingerprint IS NOT NULL;

-- ─── 4. Candidate : isolation par organisation ────────────────────────────────
-- On garantit qu'un candidat est unique PAR (email, organization_id) — pas
-- globalement. Chaque org a sa propre copie isolée du candidat (RGPD-friendly).

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_email_org
  ON module_c_rh.candidates(email, organization_id)
  WHERE organization_id IS NOT NULL;

COMMIT;

-- ─── Verification ─────────────────────────────────────────────────────────────
SELECT 'public_careers_v2 migration done' AS status;
SELECT
  COUNT(*) FILTER (WHERE visibility_state = 'published') AS published_jobs,
  COUNT(*) FILTER (WHERE search_vector IS NOT NULL) AS jobs_with_search_vector
FROM module_c_rh.job_openings;
SELECT
  COUNT(*) AS total_applications,
  COUNT(*) FILTER (WHERE organization_id IS NOT NULL) AS apps_with_org
FROM module_c_rh.job_applications;

-- =====================================================================
-- TEST CRUD COMPLET — Public Careers API
-- =====================================================================
-- À exécuter dans psql :  \i 'backend/test-public-careers.sql'
-- Ou copier-coller bloc par bloc.

-- ─── 0. Pré-requis : vérifier qu'on a au moins une organisation ─────────
SELECT id, name, name_code FROM core.organizations LIMIT 5;
-- Note ton org_id favori (ex: LYDG) pour la suite.


-- ─── 1. CREATE : insérer une offre publiée prête pour les tests ─────────
INSERT INTO module_c_rh.job_openings (
  organization_id,
  job_title,
  job_description,
  employment_type,
  experience_level,
  salary_range_min,
  salary_range_max,
  currency,
  status,
  visibility_state,
  is_public,
  opening_date,
  closing_date,
  slug,
  published_at
)
SELECT
  o.id,                                          -- org_id depuis 1ère org
  'Software Engineer Senior',
  'Nous recherchons un développeur senior pour rejoindre notre équipe tech. Stack: NestJS, React, PostgreSQL. Télétravail partiel.',
  'FULL_TIME',
  'SENIOR',
  50000,
  80000,
  'XOF',
  'published',
  'published',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '60 days',
  'test-software-engineer',
  NOW()
FROM core.organizations o
ORDER BY o.created_at
LIMIT 1
ON CONFLICT (slug) DO UPDATE
  SET visibility_state = 'published',
      is_public = true,
      published_at = NOW(),
      closing_date = CURRENT_DATE + INTERVAL '60 days';

-- Vérifier que l'offre est bien là
SELECT id, organization_id, job_title, slug, visibility_state, closing_date
FROM module_c_rh.job_openings
WHERE slug = 'test-software-engineer';


-- ─── 1b. Insérer une 2e offre (cross-organisation test) ─────────────────
INSERT INTO module_c_rh.job_openings (
  organization_id, job_title, job_description, employment_type,
  experience_level, currency, status, visibility_state, is_public,
  opening_date, closing_date, slug, published_at
)
SELECT
  o.id,
  'Designer UI/UX',
  'Designer créatif pour notre produit phare. Maîtrise Figma indispensable.',
  'FULL_TIME', 'MID_LEVEL', 'XOF',
  'published', 'published', true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '45 days',
  'test-designer-ui-ux',
  NOW()
FROM core.organizations o
ORDER BY o.created_at
LIMIT 1
ON CONFLICT (slug) DO NOTHING;


-- ─── 2. READ : vérifier que les requêtes publiques voient bien ─────────
-- Simule ce que searchPublicJobs() retourne
SELECT
  slug,
  job_title,
  visibility_state,
  closing_date,
  organization_id
FROM module_c_rh.job_openings
WHERE visibility_state = 'published'
  AND (closing_date IS NULL OR closing_date > NOW());


-- ─── 3. Test du search vector (FTS) ─────────────────────────────────────
-- Le trigger doit avoir rempli automatiquement le search_vector
SELECT slug, job_title,
       search_vector IS NOT NULL AS has_vector
FROM module_c_rh.job_openings
WHERE slug LIKE 'test-%';

-- Test plainto_tsquery (ce que fait le service)
SELECT slug, job_title
FROM module_c_rh.job_openings
WHERE visibility_state = 'published'
  AND search_vector @@ plainto_tsquery('simple', 'designer');


-- ─── 4. UPDATE : archiver une offre ─────────────────────────────────────
-- Test que l'archive fait disparaître l'offre du public
-- UPDATE module_c_rh.job_openings
-- SET visibility_state = 'archived'
-- WHERE slug = 'test-designer-ui-ux';


-- ─── 5. VERIF : voir les candidatures créées (après POST /apply) ───────
SELECT
  ja.id,
  ja.organization_id,
  ja.applicant_email,
  ja.applicant_full_name,
  ja.applicant_ip,
  ja.applicant_device_fingerprint,
  ja.cv_url,
  ja.cv_mime_type,
  ja.stage,
  ja.application_date,
  jo.slug AS job_slug
FROM module_c_rh.job_applications ja
JOIN module_c_rh.job_openings jo ON jo.id = ja.job_opening_id
WHERE jo.slug LIKE 'test-%'
ORDER BY ja.application_date DESC;


-- ─── 6. VERIF candidats créés ──────────────────────────────────────────
SELECT id, email, organization_id, source, status, created_at
FROM module_c_rh.candidates
WHERE source = 'public_website'
ORDER BY created_at DESC
LIMIT 10;


-- ─── 7. CLEAN : nettoyer après les tests (à décommenter) ───────────────
-- DELETE FROM module_c_rh.job_applications
--   WHERE job_opening_id IN (
--     SELECT id FROM module_c_rh.job_openings WHERE slug LIKE 'test-%'
--   );
-- DELETE FROM module_c_rh.candidates WHERE email LIKE '%@example.com';
-- DELETE FROM module_c_rh.job_openings WHERE slug LIKE 'test-%';

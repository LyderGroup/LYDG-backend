-- Verification du socle COLLABORATEUR, ORGANISATION PAR ORGANISATION.
--
-- POURQUOI CE SCRIPT
--
-- verify-deployment-state.sql agregeait les compteurs sur toutes les
-- organisations a la fois, ce qui rend la comparaison avec EMPLOYEE
-- ininterpretable : core.roles porte UNIQUE(organization_id, code), il existe
-- donc une ligne COLLABORATEUR et une ligne EMPLOYEE PAR organisation.
--
-- Point critique : rbac.service.ts resout les permissions avec
-- `AND r.is_active = true`. Un role DESACTIVE n'accorde donc AUCUN droit, meme
-- s'il est rattache a des utilisateurs.
--
-- Lecture seule.
--
-- Usage :
--   psql -U postgres -d lydg -f backend/scripts/verify-roles-per-org.sql

\echo ''
\echo '=== Socle par organisation ==='
\echo '    manquantes = permissions d EMPLOYEE absentes de COLLABORATEUR'
\echo '    Une organisation est SAINE si : collab_actif = t ET manquantes = 0'

WITH perms AS (
  SELECT r.organization_id, r.code, r.is_active, rp.permission_id
  FROM core.roles r
  LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
  WHERE r.code IN ('COLLABORATEUR', 'EMPLOYEE')
)
SELECT
  o.name AS organisation,
  o.name_code,
  bool_or(p.code = 'COLLABORATEUR' AND p.is_active)  AS collab_actif,
  COUNT(DISTINCT p.permission_id)
    FILTER (WHERE p.code = 'COLLABORATEUR')          AS perms_collab,
  COUNT(DISTINCT p.permission_id)
    FILTER (WHERE p.code = 'EMPLOYEE')               AS perms_employee,
  COUNT(DISTINCT p.permission_id) FILTER (
    WHERE p.code = 'EMPLOYEE'
      AND p.permission_id NOT IN (
        SELECT c.permission_id FROM perms c
        WHERE c.code = 'COLLABORATEUR'
          AND c.organization_id IS NOT DISTINCT FROM o.id
          AND c.permission_id IS NOT NULL
      )
  )                                                  AS manquantes
FROM core.organizations o
LEFT JOIN perms p ON p.organization_id IS NOT DISTINCT FROM o.id
WHERE o.is_active = true
GROUP BY o.id, o.name, o.name_code
ORDER BY o.name;

\echo ''
\echo '=== Utilisateurs rattaches a un role DESACTIVE ==='
\echo '    Ces personnes ne recoivent aucun droit de ce role.'

SELECT o.name AS organisation,
       r.code AS role_desactive,
       COUNT(DISTINCT ur.user_id) AS utilisateurs,
       string_agg(DISTINCT u.email, ', ' ORDER BY u.email) AS emails
FROM core.user_roles ur
JOIN core.roles r ON r.id = ur.role_id AND r.is_active = false
JOIN core.users u ON u.id = ur.user_id
LEFT JOIN core.organizations o ON o.id = r.organization_id
WHERE ur.is_active = true
GROUP BY o.name, r.code
ORDER BY 3 DESC;

\echo ''
\echo '=== Utilisateurs sans AUCUN role actif ==='
\echo '    Ils ne peuvent rien faire dans l application.'

SELECT u.email, o.name AS organisation
FROM core.users u
LEFT JOIN core.organizations o ON o.id = u.organization_id
WHERE u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM core.user_roles ur
    JOIN core.roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND ur.is_active = true AND r.is_active = true
  )
ORDER BY u.email;

\echo ''
\echo '=== Extensions PostgreSQL reellement installees ==='
\echo '    Determine ce qu il faut installer sur le VPS — ni plus, ni moins.'

SELECT e.name AS extension,
       EXISTS (SELECT 1 FROM pg_extension x WHERE x.extname = e.name) AS installee
FROM (VALUES ('postgis'), ('unaccent'), ('pgcrypto'), ('uuid-ossp')) AS e(name)
ORDER BY 1;

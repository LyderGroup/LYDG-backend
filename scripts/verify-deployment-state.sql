-- Verification de l'etat de la base avant et apres deploiement.
--
-- A jouer deux fois :
--   1. sur la base de dev, apres les 5 migrations
--   2. sur la base du VPS, apres restauration + migrations
-- Les deux sorties doivent etre identiques.
--
-- Lecture seule : aucune ecriture, rejouable a volonte.
--
-- Usage :
--   psql -U postgres -d lydg -f backend/scripts/verify-deployment-state.sql

\echo ''
\echo '=== 1. Migrations appliquees ==='

SELECT 'employees.first_name (decouplage collaborateur/compte)' AS verification,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'module_c_rh' AND table_name = 'employees'
           AND column_name = 'first_name'
       ) AS ok
UNION ALL
SELECT 'employees.emergency_contact_whatsapp',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'module_c_rh' AND table_name = 'employees'
           AND column_name = 'emergency_contact_whatsapp'
       )
UNION ALL
SELECT 'employees.emergency_contact_address',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'module_c_rh' AND table_name = 'employees'
           AND column_name = 'emergency_contact_address'
       )
UNION ALL
SELECT 'organizations.social_networks',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'core' AND table_name = 'organizations'
           AND column_name = 'social_networks'
       )
UNION ALL
SELECT 'permissions reclassees (plus de hr / core / projects)',
       NOT EXISTS (
         SELECT 1 FROM core.permissions
         WHERE system_module_code IN ('hr', 'core', 'projects')
       )
UNION ALL
SELECT 'index unique sur permissions.code',
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'core' AND indexname = 'uq_permissions_code'
       )
UNION ALL
SELECT 'role EMPLOYEE desactive (mis de cote, pas supprime)',
       EXISTS (
         SELECT 1 FROM core.roles WHERE code = 'EMPLOYEE' AND is_active = false
       )
UNION ALL
SELECT 'extensions requises presentes (postgis, unaccent, pgcrypto)',
       (SELECT COUNT(*) FROM pg_extension
        WHERE extname IN ('postgis', 'unaccent', 'pgcrypto')) = 3
ORDER BY 1;

\echo ''
\echo '=== 2. Roles socle : le transfert de droits a-t-il eu lieu ? ==='
\echo '    COLLABORATEUR doit porter AU MOINS autant de permissions qu EMPLOYEE.'

SELECT r.code,
       r.is_active,
       COUNT(DISTINCT rp.permission_id) AS permissions,
       COUNT(DISTINCT ur.user_id) FILTER (WHERE ur.is_active) AS utilisateurs_actifs
FROM core.roles r
LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
LEFT JOIN core.user_roles ur ON ur.role_id = r.id
WHERE r.code IN ('COLLABORATEUR', 'EMPLOYEE')
GROUP BY r.code, r.is_active
ORDER BY r.code;

\echo ''
\echo '=== 3. Droits libre-service presents sur COLLABORATEUR ==='
\echo '    Sans eux, un nouvel utilisateur ne peut ni pointer ni demander un conge.'

SELECT p.code,
       EXISTS (
         SELECT 1 FROM core.role_permissions rp
         JOIN core.roles r ON r.id = rp.role_id
         WHERE r.code = 'COLLABORATEUR' AND rp.permission_id = p.id
       ) AS sur_collaborateur
FROM core.permissions p
WHERE p.code IN (
  'hr.employees.read.own',
  'hr.attendance.write',
  'hr.leave.write',
  'hr.documents.sign',
  'hr.salary.read.own'
)
ORDER BY p.code;

\echo ''
\echo '=== 4. Volumetrie (a comparer entre dev et VPS) ==='

SELECT 'organizations' AS table_, COUNT(*) FROM core.organizations
UNION ALL SELECT 'users', COUNT(*) FROM core.users
UNION ALL SELECT 'roles', COUNT(*) FROM core.roles
UNION ALL SELECT 'permissions', COUNT(*) FROM core.permissions
UNION ALL SELECT 'role_permissions', COUNT(*) FROM core.role_permissions
UNION ALL SELECT 'user_roles', COUNT(*) FROM core.user_roles
UNION ALL SELECT 'employees', COUNT(*) FROM module_c_rh.employees
ORDER BY 1;

\echo ''
\echo '=== 5. Repartition des permissions par module ==='
\echo '    Tous les codes doivent etre connus de MODULE_META :'
\echo '    global, module_a_pilotage, module_b_projects, module_c_rh,'
\echo '    module_d_finance, module_e_academy, module_f_documents.'

SELECT system_module_code, COUNT(*) AS nb
FROM core.permissions
GROUP BY 1
ORDER BY 2 DESC;

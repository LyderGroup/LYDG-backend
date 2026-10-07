-- Migration: unifier les roles COLLABORATEUR et EMPLOYEE (option A)
--
-- CONTEXTE
--
-- Deux roles coexistaient et semblaient synonymes, mais ne portaient pas les
-- memes droits :
--
--   EMPLOYEE      (niveau 100) : les droits « sur soi » — voir sa fiche, son
--                                salaire, POINTER, DEMANDER UN CONGE, SIGNER
--                                ses documents, s'inscrire a une formation.
--   COLLABORATEUR (niveau 60)  : uniquement des droits projets. Rien sur soi.
--
-- Le code applicatif attribue COLLABORATEUR comme role socle a tout nouvel
-- utilisateur (users.service.ts, DEFAULT_COLLABORATOR_ROLE_CODE). Sans cette
-- migration, une personne nouvellement creee ne pourrait ni pointer, ni
-- demander un conge, ni signer ses documents.
--
-- On garde donc le nom « Collaborateur », qui est le vocabulaire retenu dans
-- toute l'application, et on y transfere les droits d'EMPLOYEE.
--
-- AUCUNE SUPPRESSION
--
-- EMPLOYEE n'est pas supprime : il est desactive (is_active = false) et ses
-- rattachements utilisateurs sont desactives, pas effaces. Les lignes restent
-- en base, l'operation est donc reversible.
--
-- MULTI-TENANT
--
-- core.roles porte UNIQUE(organization_id, code) et les roles tenant sont semes
-- pour CHAQUE organisation. Tous les appariements ci-dessous se font donc
-- organisation par organisation : jamais le role d'un tenant vers un autre.
--
-- Idempotent, rejouable sans risque.

BEGIN;

-- 1) Etat avant, pour comparaison apres COMMIT.
DO $$
DECLARE
  v_emp_perms INT;
  v_col_perms INT;
  v_emp_users INT;
BEGIN
  SELECT COUNT(*) INTO v_emp_perms
  FROM core.role_permissions rp
  JOIN core.roles r ON r.id = rp.role_id
  WHERE r.code = 'EMPLOYEE';

  SELECT COUNT(*) INTO v_col_perms
  FROM core.role_permissions rp
  JOIN core.roles r ON r.id = rp.role_id
  WHERE r.code = 'COLLABORATEUR';

  SELECT COUNT(*) INTO v_emp_users
  FROM core.user_roles ur
  JOIN core.roles r ON r.id = ur.role_id
  WHERE r.code = 'EMPLOYEE' AND ur.is_active = true;

  RAISE NOTICE 'AVANT — permissions EMPLOYEE: %, permissions COLLABORATEUR: %, utilisateurs actifs sur EMPLOYEE: %',
    v_emp_perms, v_col_perms, v_emp_users;
END $$;

-- 2) Transfert des permissions d'EMPLOYEE vers COLLABORATEUR, par organisation.
--
-- ON CONFLICT DO NOTHING : la contrainte est UNIQUE(role_id, permission_id) et
-- les deux roles partagent deja les 7 permissions projets.
INSERT INTO core.role_permissions (id, role_id, permission_id, granted_at)
SELECT gen_random_uuid(), collaborateur.id, rp.permission_id, CURRENT_TIMESTAMP
FROM core.roles employee
JOIN core.roles collaborateur
  ON collaborateur.code = 'COLLABORATEUR'
 AND collaborateur.organization_id IS NOT DISTINCT FROM employee.organization_id
JOIN core.role_permissions rp
  ON rp.role_id = employee.id
WHERE employee.code = 'EMPLOYEE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3) Les utilisateurs qui n'avaient qu'EMPLOYEE recoivent COLLABORATEUR.
--
-- Fait AVANT la desactivation : sinon ces personnes se retrouveraient sans
-- aucun role le temps de la transaction.
INSERT INTO core.user_roles (id, user_id, role_id, assigned_at, is_active)
SELECT gen_random_uuid(), ur.user_id, collaborateur.id, CURRENT_TIMESTAMP, true
FROM core.user_roles ur
JOIN core.roles employee
  ON employee.id = ur.role_id AND employee.code = 'EMPLOYEE'
JOIN core.roles collaborateur
  ON collaborateur.code = 'COLLABORATEUR'
 AND collaborateur.organization_id IS NOT DISTINCT FROM employee.organization_id
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Reactive un rattachement COLLABORATEUR qui existerait mais serait inactif.
UPDATE core.user_roles ur
SET is_active = true
FROM core.roles collaborateur
WHERE ur.role_id = collaborateur.id
  AND collaborateur.code = 'COLLABORATEUR'
  AND ur.is_active = false
  AND EXISTS (
    SELECT 1
    FROM core.user_roles ue
    JOIN core.roles employee
      ON employee.id = ue.role_id AND employee.code = 'EMPLOYEE'
    WHERE ue.user_id = ur.user_id
      AND ue.is_active = true
      AND employee.organization_id IS NOT DISTINCT FROM collaborateur.organization_id
  );

-- 4) Mise de cote d'EMPLOYEE — desactivation, pas suppression.
UPDATE core.user_roles ur
SET is_active = false
FROM core.roles employee
WHERE ur.role_id = employee.id
  AND employee.code = 'EMPLOYEE'
  AND ur.is_active = true;

UPDATE core.roles
SET is_active = false,
    description = 'OBSOLETE — fusionne dans COLLABORATEUR. Conserve pour reversibilite.'
WHERE code = 'EMPLOYEE'
  AND is_active = true;

-- 5) Le role socle doit exister et etre actif, sinon le code applicatif
--    n'attribuera rien et les nouveaux comptes seront sans droits.
DO $$
DECLARE
  v_orgs_sans_role INT;
BEGIN
  SELECT COUNT(*) INTO v_orgs_sans_role
  FROM core.organizations o
  WHERE o.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM core.roles r
      WHERE r.organization_id = o.id
        AND r.code = 'COLLABORATEUR'
        AND r.is_active = true
    );

  IF v_orgs_sans_role > 0 THEN
    RAISE WARNING
      '% organisation(s) active(s) sans role COLLABORATEUR actif : les nouveaux comptes y seront sans socle. Rejouer rbac_seed_roles_system_and_tenant.sql.',
      v_orgs_sans_role;
  END IF;
END $$;

COMMIT;

-- Verification apres migration.
SELECT
  r.code,
  r.is_active,
  COUNT(DISTINCT rp.permission_id) AS permissions,
  COUNT(DISTINCT ur.user_id) FILTER (WHERE ur.is_active) AS utilisateurs_actifs
FROM core.roles r
LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
LEFT JOIN core.user_roles ur ON ur.role_id = r.id
WHERE r.code IN ('COLLABORATEUR', 'EMPLOYEE')
GROUP BY r.code, r.is_active
ORDER BY r.code;

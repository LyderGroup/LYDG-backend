-- Migration: reclasser les permissions sous leur vrai code de module
--
-- CONSTAT (verifie en base avant d'ecrire cette migration) :
--   SELECT code, COUNT(*) FROM core.permissions GROUP BY 1 HAVING COUNT(*) > 1;
--   -> 0 ligne. Il n'y a AUCUN doublon de code.
--
-- Les groupes "hr" (13), "core" (19) et "projects" (23) ne sont donc pas des
-- doublons de "Ressources Humaines", "Administration systeme" et "Projets &
-- Taches" : ce sont 55 permissions DISTINCTES, rangees sous un code de module
-- absent de MODULE_META (rbac-management.service.ts), donc affichees brutes
-- dans l'interface.
--
-- Deux semeurs ne s'accordaient pas sur le code :
--   permission.seeder.service.ts  -> 'hr', 'core'          (desormais aligne)
--   seeds SQL + initializer       -> 'module_c_rh', 'global'
--
-- Cette migration ne touche ni role_permissions ni user_roles : elle ne change
-- que l'etiquette de regroupement. Aucun droit n'est accorde ni retire.
--
-- Idempotent, rejouable sans risque.

BEGIN;

-- 1) Collisions possibles ?
--
-- La contrainte est UNIQUE(system_module_code, resource, action). Deplacer une
-- ligne de 'hr' vers 'module_c_rh' echouerait si un couple (resource, action)
-- identique y existait deja. Les codes etant uniques, c'est improbable, mais on
-- le verifie explicitement : en cas de collision, le RAISE annule tout plutot
-- que de laisser la transaction echouer sur une erreur 23505 opaque.
DO $$
DECLARE
  v_collisions INT;
  v_detail TEXT;
BEGIN
  SELECT COUNT(*), string_agg(DISTINCT ancien.code || ' <-> ' || cible.code, ', ')
    INTO v_collisions, v_detail
  FROM core.permissions ancien
  JOIN core.permissions cible
    ON cible.resource = ancien.resource
   AND cible.action = ancien.action
   AND cible.id <> ancien.id
   AND cible.system_module_code = CASE ancien.system_module_code
         WHEN 'hr'       THEN 'module_c_rh'
         WHEN 'core'     THEN 'global'
         WHEN 'projects' THEN 'module_b_projects'
       END
  WHERE ancien.system_module_code IN ('hr', 'core', 'projects');

  IF v_collisions > 0 THEN
    RAISE EXCEPTION
      'Reclassement impossible : % collision(s) sur (resource, action) : %',
      v_collisions, v_detail;
  END IF;
END $$;

-- 2) Reclassement
UPDATE core.permissions SET system_module_code = 'module_c_rh'
 WHERE system_module_code = 'hr';

UPDATE core.permissions SET system_module_code = 'global'
 WHERE system_module_code = 'core';

UPDATE core.permissions SET system_module_code = 'module_b_projects'
 WHERE system_module_code = 'projects';

-- 3) Verrou pour que la divergence ne puisse plus reapparaitre.
--
-- Index partiel plutot que contrainte UNIQUE : `code` est nullable, et un index
-- partiel ignore proprement les lignes sans code. Cree seulement s'il n'existe
-- pas, pour rester rejouable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_code
  ON core.permissions (code)
  WHERE code IS NOT NULL;

COMMIT;

-- Verification : il ne doit plus rester que des codes connus de MODULE_META.
SELECT system_module_code, COUNT(*) AS nb
FROM core.permissions
GROUP BY 1
ORDER BY 2 DESC;

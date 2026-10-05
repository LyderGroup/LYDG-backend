-- Migration: rendre le collaborateur autonome vis-a-vis du compte utilisateur
--
-- Jusqu'ici l'identite d'un employe vivait uniquement dans core.users : nom,
-- prenom, email et telephone etaient lus via employees.user_id. Un employe sans
-- compte n'avait donc aucun nom affichable, et hr.service refusait de le creer.
--
-- On rapatrie ces quatre champs sur la fiche RH. Le compte utilisateur reste
-- optionnel et sert uniquement a se connecter.
--
-- Idempotent, rejouable sans risque.

ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);

ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Reprise de l'existant : les fiches deja rattachees a un compte recuperent
-- son etat civil, pour que l'affichage ne regresse pas apres deploiement.
-- Le WHERE ... IS NULL rend l'operation rejouable sans ecraser une saisie RH.
UPDATE module_c_rh.employees e
SET
  first_name = COALESCE(e.first_name, u.first_name),
  last_name  = COALESCE(e.last_name,  u.last_name),
  email      = COALESCE(e.email,      u.email),
  phone      = COALESCE(e.phone,      u.phone)
FROM core.users u
WHERE e.user_id = u.id
  AND (e.first_name IS NULL OR e.last_name IS NULL OR e.email IS NULL OR e.phone IS NULL);

-- Un employe doit etre identifiable : soit par son compte, soit par son nom.
-- NOT VALID : la contrainte s'applique aux nouvelles lignes sans bloquer le
-- deploiement sur d'eventuelles fiches historiques incompletes.
ALTER TABLE module_c_rh.employees
  DROP CONSTRAINT IF EXISTS chk_employees_identifiable;

ALTER TABLE module_c_rh.employees
  ADD CONSTRAINT chk_employees_identifiable
  CHECK (user_id IS NOT NULL OR (last_name IS NOT NULL AND last_name <> ''))
  NOT VALID;

-- Verification
SELECT
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS avec_compte,
  COUNT(*) FILTER (WHERE user_id IS NULL)     AS sans_compte,
  COUNT(*) FILTER (WHERE last_name IS NULL)   AS sans_nom
FROM module_c_rh.employees;

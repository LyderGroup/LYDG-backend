-- Migration: compléter le contact d'urgence des employés
--
-- Le bloc « Contact d'urgence » du profil affichait Prénoms, WhatsApp et
-- Adresse, mais ces trois colonnes n'existaient pas : le front retombait sur
-- emergency_contact_phone pour les trois champs.
--
-- Idempotent, rejouable sans risque.

-- Prénoms du contact (emergency_contact_name ne porte que le nom de famille)
ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS emergency_contact_first_name VARCHAR(255);

-- Numéro WhatsApp, souvent distinct du téléphone principal, donc au cas ou le donnée est encore celui de whatsapp, on coche juste dans le formulaire que c'est le même numéro, mais on garde la colonne pour le cas ou le numéro est différent.
ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS emergency_contact_whatsapp VARCHAR(20);

-- Adresse postale du contact
ALTER TABLE module_c_rh.employees
  ADD COLUMN IF NOT EXISTS emergency_contact_address TEXT;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'module_c_rh'
  AND table_name = 'employees'
  AND column_name LIKE 'emergency_contact%'
ORDER BY ordinal_position;

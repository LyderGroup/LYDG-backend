-- Migration: Ajouter les colonnes manquantes à la table employees
-- Erreur: column e.birth_date does not exist

-- Ajouter birth_date
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Ajouter marital_status
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS marital_status VARCHAR(50);

-- Ajouter dependents_count
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS dependents_count INT DEFAULT 0;

-- Ajouter emergency_contact_name
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);

-- Ajouter emergency_contact_relationship
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100);

-- Ajouter emergency_contact_phone
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);

-- Ajouter emergency_contact_email
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(255);

-- Ajouter work_start_time
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS work_start_time TIME;

-- Ajouter work_end_time
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS work_end_time TIME;

-- Ajouter work_hours_per_day
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS work_hours_per_day DECIMAL(4,2);

-- Ajouter badges
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS badges TEXT;

-- Vérification
SELECT column_name FROM information_schema.columns WHERE table_schema = 'module_c_rh' AND table_name = 'employees' ORDER BY ordinal_position;

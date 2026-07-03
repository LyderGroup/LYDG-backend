-- Migration: Corriger les foreign keys de employees vers departments
-- Erreur: employees_department_id_fkey pointe vers mauvaise table

-- Supprimer l'ancienne contrainte FK
ALTER TABLE module_c_rh.employees DROP CONSTRAINT IF EXISTS employees_department_id_fkey;

-- Recréer la FK vers core.departments
ALTER TABLE module_c_rh.employees 
    ADD CONSTRAINT employees_department_id_fkey 
    FOREIGN KEY (department_id) REFERENCES core.departments(id) 
    ON DELETE SET NULL;

-- Vérifier si le department existe, sinon le créer
INSERT INTO core.departments (id, organization_id, name, code, is_active, created_at, updated_at)
SELECT 
    'a02ba6a8-8a4a-45bd-9f1d-bbc2e235e035'::uuid,
    '422c2785-dcdb-413b-8bc2-95a962847710'::uuid,
    'Département par défaut',
    'DEFAULT',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM core.departments WHERE id = 'a02ba6a8-8a4a-45bd-9f1d-bbc2e235e035'::uuid
);

-- Vérification
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'module_c_rh.employees'::regclass 
AND conname = 'employees_department_id_fkey';

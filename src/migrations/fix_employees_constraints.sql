 
ALTER TABLE module_c_rh.employees DROP CONSTRAINT IF EXISTS employees_contract_type_check;
ALTER TABLE module_c_rh.employees DROP CONSTRAINT IF EXISTS employees_employment_type_check;
ALTER TABLE module_c_rh.employees DROP CONSTRAINT IF EXISTS employees_employment_status_check;


ALTER TABLE module_c_rh.employees ADD CONSTRAINT employees_contract_type_check 
    CHECK (contract_type IS NULL OR contract_type IN ('CDI', 'CDD', 'CTT', 'CTP', 'apprenticeship', 'internship', 'freelance', 'contractor'));

ALTER TABLE module_c_rh.employees ADD CONSTRAINT employees_employment_type_check 
    CHECK (employment_type IS NULL OR employment_type IN ('permanent', 'temporary', 'part_time', 'full_time', 'intern', 'contractor', 'freelance'));

ALTER TABLE module_c_rh.employees ADD CONSTRAINT employees_employment_status_check 
    CHECK (employment_status IN ('active', 'inactive', 'on_leave', 'suspended', 'terminated', 'probation'));


SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'module_c_rh.employees'::regclass AND contype = 'c';

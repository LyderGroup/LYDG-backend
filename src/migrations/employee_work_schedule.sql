 
ALTER TABLE module_c_rh.employees DROP COLUMN IF EXISTS work_hours_per_day;
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS work_days character varying(255);
ALTER TABLE module_c_rh.employees ADD COLUMN IF NOT EXISTS annual_leave_days integer;

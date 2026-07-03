-- Migration: Corriger les tables RH manquantes et colonnes
-- Erreurs: column doc.title does not exist, databaseName undefined

-- =============================================================================
-- 1. HR_DOCUMENTS - Ajouter colonnes manquantes
-- =============================================================================
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS reference_code VARCHAR(100);
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0';
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS previous_version_id UUID;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS required_action VARCHAR(20) DEFAULT 'READ_ONLY';
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN DEFAULT FALSE;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS deadline_days INT;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT FALSE;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS allow_print BOOLEAN DEFAULT FALSE;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS published_by UUID;
ALTER TABLE module_c_rh.hr_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- =============================================================================
-- 2. LEAVE_TYPES - Table pour les types de congés
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    days_allowed INT DEFAULT 0,
    is_paid BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT TRUE,
    carry_over_max INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 3. JOB_POSITIONS - Table pour les postes
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.job_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    department_id UUID,
    title VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    requirements TEXT,
    responsibilities TEXT,
    employment_type VARCHAR(50),
    salary_min DECIMAL(15,2),
    salary_max DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'XOF',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 4. HR_DEPARTMENTS - Table pour les départements RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    parent_department_id UUID,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    manager_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- 5. LEAVE_REQUESTS - Ajouter colonnes manquantes
-- =============================================================================
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS start_period VARCHAR(10) DEFAULT 'full_day';
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS end_period VARCHAR(10) DEFAULT 'full_day';
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS weekends_count DECIMAL(4,1) DEFAULT 0;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS holidays_count DECIMAL(4,1) DEFAULT 0;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS workflow_instance_id UUID;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS substitute_employee_id UUID;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS handover_notes TEXT;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS is_joker BOOLEAN DEFAULT FALSE;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE module_c_rh.leave_requests ADD COLUMN IF NOT EXISTS end_time TIME;

-- =============================================================================
-- 6. JOB_OPENINGS - Ajouter colonnes manquantes
-- =============================================================================
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS position_id UUID;
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS job_description TEXT;
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50);
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50);
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS salary_range_min DECIMAL(15,2);
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS salary_range_max DECIMAL(15,2);
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'XOF';
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS opening_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS closing_date DATE;
ALTER TABLE module_c_rh.job_openings ADD COLUMN IF NOT EXISTS created_by UUID;

-- =============================================================================
-- 7. CANDIDATES - Ajouter colonnes manquantes
-- =============================================================================
ALTER TABLE module_c_rh.candidates ADD COLUMN IF NOT EXISTS current_position VARCHAR(255);
ALTER TABLE module_c_rh.candidates ADD COLUMN IF NOT EXISTS total_experience_years INT;
ALTER TABLE module_c_rh.candidates ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE module_c_rh.candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- =============================================================================
-- Vérification
-- =============================================================================
SELECT 'hr_documents columns' as check_type, COUNT(*) as count FROM information_schema.columns 
    WHERE table_schema = 'module_c_rh' AND table_name = 'hr_documents'
UNION ALL
SELECT 'leave_types exists', COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'module_c_rh' AND table_name = 'leave_types'
UNION ALL
SELECT 'job_positions exists', COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'module_c_rh' AND table_name = 'job_positions'
UNION ALL
SELECT 'hr_departments exists', COUNT(*) FROM information_schema.tables 
    WHERE table_schema = 'module_c_rh' AND table_name = 'hr_departments';

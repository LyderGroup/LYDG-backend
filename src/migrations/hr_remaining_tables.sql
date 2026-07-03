-- Migration: Tables RH restantes (5 tables)
-- Complète les tables manquantes

-- =============================================================================
-- 1. ATTENDANCES - Présence des employés
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    scheduled_start_time TIME,
    scheduled_end_time TIME,
    scheduled_hours DECIMAL(4,2),
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    status VARCHAR(50) DEFAULT 'present',
    late_reason TEXT,
    absence_reason TEXT,
    justified BOOLEAN DEFAULT false,
    justification_notes TEXT,
    approved_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendances_employee ON module_c_rh.attendances(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON module_c_rh.attendances(attendance_date);

-- =============================================================================
-- 2. EMPLOYEE_REGULATION_ASSIGNMENTS - Assignations règlements aux employés
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.employee_regulation_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    regulation_id UUID NOT NULL REFERENCES module_c_rh.internal_regulations(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_regulation_assignments_employee ON module_c_rh.employee_regulation_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_regulation_assignments_regulation ON module_c_rh.employee_regulation_assignments(regulation_id);

-- =============================================================================
-- 3. HR_DOCUMENT_TYPE_CONFIGS - Configuration types de documents RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_document_type_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT false,
    expiry_months INTEGER,
    reminder_days INTEGER,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_document_type_configs_org ON module_c_rh.hr_document_type_configs(organization_id);

-- =============================================================================
-- 4. MONTHLY_EVALUATIONS - Évaluations mensuelles
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.monthly_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    evaluation_month INTEGER NOT NULL,
    evaluation_year INTEGER NOT NULL,
    evaluator_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    total_score DECIMAL(5,2),
    max_score DECIMAL(5,2),
    comments TEXT,
    status VARCHAR(20) DEFAULT 'draft',
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_monthly_evaluations_employee ON module_c_rh.monthly_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_monthly_evaluations_org ON module_c_rh.monthly_evaluations(organization_id);

-- =============================================================================
-- 5. EVALUATION_KPI_SCORES - Scores KPI par évaluation
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.evaluation_kpi_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES module_c_rh.monthly_evaluations(id) ON DELETE CASCADE,
    kpi_id UUID NOT NULL REFERENCES module_c_rh.kpis(id) ON DELETE CASCADE,
    score DECIMAL(5,2),
    max_score DECIMAL(5,2),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evaluation_kpi_scores_evaluation ON module_c_rh.evaluation_kpi_scores(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_kpi_scores_kpi ON module_c_rh.evaluation_kpi_scores(kpi_id);

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================
COMMENT ON TABLE module_c_rh.attendances IS 'Présence des employés';
COMMENT ON TABLE module_c_rh.employee_regulation_assignments IS 'Assignations règlements aux employés';
COMMENT ON TABLE module_c_rh.hr_document_type_configs IS 'Configuration types de documents RH';
COMMENT ON TABLE module_c_rh.monthly_evaluations IS 'Évaluations mensuelles';
COMMENT ON TABLE module_c_rh.evaluation_kpi_scores IS 'Scores KPI par évaluation';

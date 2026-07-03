
CREATE TABLE IF NOT EXISTS module_c_rh.salary_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    position_id UUID NOT NULL,
    component_type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    conditions JSONB DEFAULT '{}',
    calculation_type VARCHAR(20) DEFAULT 'fixed',
    calculation_base VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_salary_components_org ON module_c_rh.salary_components(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_components_position ON module_c_rh.salary_components(position_id);
CREATE INDEX IF NOT EXISTS idx_salary_components_type ON module_c_rh.salary_components(component_type);

CREATE TABLE IF NOT EXISTS module_c_rh.employee_salary_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    base_salary DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    components JSONB DEFAULT '[]',
    total_fixed DECIMAL(15,2),
    max_performance_bonus DECIMAL(15,2),
    valid_from DATE NOT NULL,
    valid_to DATE,
    previous_salary DECIMAL(15,2),
    change_type VARCHAR(20),
    change_reason TEXT,
    changed_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_history_employee ON module_c_rh.employee_salary_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_salary_history_valid_from ON module_c_rh.employee_salary_history(valid_from);
CREATE INDEX IF NOT EXISTS idx_employee_salary_history_deleted ON module_c_rh.employee_salary_history(deleted_at);
 
CREATE TABLE IF NOT EXISTS module_c_rh.salary_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    pay_day INTEGER NOT NULL CHECK (pay_day >= 1 AND pay_day <= 31),
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    frequency VARCHAR(20) DEFAULT 'monthly',
    custom_interval INTEGER,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_salary_schedules_employee ON module_c_rh.salary_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_schedules_org ON module_c_rh.salary_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_schedules_active ON module_c_rh.salary_schedules(is_active);
 
CREATE TABLE IF NOT EXISTS module_c_rh.salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES module_c_rh.salary_schedules(id) ON DELETE SET NULL,
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    paid_date DATE,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    status VARCHAR(20) DEFAULT 'scheduled',
    transaction_ref VARCHAR(100),
    notes TEXT,
    processed_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON module_c_rh.salary_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_org ON module_c_rh.salary_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_status ON module_c_rh.salary_payments(status);
CREATE INDEX IF NOT EXISTS idx_salary_payments_scheduled_date ON module_c_rh.salary_payments(scheduled_date);
 
COMMENT ON TABLE module_c_rh.salary_components IS 'Composants salariaux configurables par organisation';
COMMENT ON TABLE module_c_rh.employee_salary_history IS 'Historique des changements de salaire des employés';
COMMENT ON TABLE module_c_rh.salary_schedules IS 'Planification des paiements de salaires';
COMMENT ON TABLE module_c_rh.salary_payments IS 'Enregistrement des paiements de salaires effectués';

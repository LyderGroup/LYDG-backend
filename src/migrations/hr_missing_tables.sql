-- Migration: Tables RH manquantes (27 tables)
-- Crée toutes les tables manquantes pour le module RH

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
-- 2. OFFICE_ATTENDANCES - Présence au bureau avec géolocalisation
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.office_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    scheduled_check_in TIME,
    scheduled_check_out TIME,
    actual_check_in TIME,
    actual_check_out TIME,
    scheduled_hours DECIMAL(4,2),
    actual_hours DECIMAL(4,2),
    status VARCHAR(20) DEFAULT 'present',
    is_justified BOOLEAN DEFAULT false,
    justification_notes TEXT,
    justification_document_url TEXT,
    validated_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    validated_at TIMESTAMP,
    notes TEXT,
    check_in_latitude DECIMAL(10,7),
    check_in_longitude DECIMAL(10,7),
    check_out_latitude DECIMAL(10,7),
    check_out_longitude DECIMAL(10,7),
    is_in_zone BOOLEAN DEFAULT true,
    off_site_location TEXT,
    off_site_reason TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_office_attendances_employee ON module_c_rh.office_attendances(employee_id);
CREATE INDEX IF NOT EXISTS idx_office_attendances_org ON module_c_rh.office_attendances(organization_id);
CREATE INDEX IF NOT EXISTS idx_office_attendances_date ON module_c_rh.office_attendances(attendance_date);

-- =============================================================================
-- 3. INTERNAL_REGULATIONS - Règlements intérieurs
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.internal_regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    version VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    effective_from DATE,
    effective_to DATE,
    created_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internal_regulations_org ON module_c_rh.internal_regulations(organization_id);

-- =============================================================================
-- 4. REGULATION_DOCUMENTS - Documents de règlement
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.regulation_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regulation_id UUID NOT NULL REFERENCES module_c_rh.internal_regulations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_regulation_documents_regulation ON module_c_rh.regulation_documents(regulation_id);

-- =============================================================================
-- 5. EMPLOYEE_REGULATION_ASSIGNMENTS - Assignations règlements aux employés
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
-- 6. ELECTRONIC_SIGNATURES - Signatures électroniques
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.electronic_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    document_id UUID,
    signature_data TEXT,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_electronic_signatures_employee ON module_c_rh.electronic_signatures(employee_id);

-- =============================================================================
-- 7. HR_DOCUMENTS - Documents RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    document_type VARCHAR(50),
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    is_template BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_org ON module_c_rh.hr_documents(organization_id);

-- =============================================================================
-- 8. HR_DOCUMENT_ASSIGNMENTS - Assignations documents RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_document_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES module_c_rh.hr_documents(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    due_date DATE,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_document_assignments_document ON module_c_rh.hr_document_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_hr_document_assignments_employee ON module_c_rh.hr_document_assignments(employee_id);

-- =============================================================================
-- 9. HR_DOCUMENT_TYPE_CONFIGS - Configuration types de documents RH
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
-- 10. KPIS (RH) - Indicateurs RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    target_value DECIMAL(10,2),
    unit VARCHAR(20),
    weight DECIMAL(5,2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpis_org ON module_c_rh.kpis(organization_id);

-- =============================================================================
-- 11. KPI_WEIGHTS - Pondérations KPI
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.kpi_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_id UUID NOT NULL REFERENCES module_c_rh.kpis(id) ON DELETE CASCADE,
    evaluation_id UUID,
    weight DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_weights_kpi ON module_c_rh.kpi_weights(kpi_id);

-- =============================================================================
-- 12. MONTHLY_EVALUATIONS - Évaluations mensuelles
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
-- 13. EVALUATION_KPI_SCORES - Scores KPI par évaluation
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
-- 14. BONUS_TYPES - Types de bonus
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.bonus_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'XOF',
    percentage_base VARCHAR(50),
    percentage_value DECIMAL(5,2),
    conditions JSONB DEFAULT '{}',
    auto_calculate BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_taxable BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bonus_types_org ON module_c_rh.bonus_types(organization_id);

-- =============================================================================
-- 15. EMPLOYEE_BONUSES - Bonus des employés
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.employee_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    bonus_type_id UUID NOT NULL REFERENCES module_c_rh.bonus_types(id) ON DELETE CASCADE,
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'XOF',
    calculation_details JSONB DEFAULT '{}',
    score_based BOOLEAN DEFAULT false,
    score_value DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'pending',
    approved_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    notes TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_bonuses_employee ON module_c_rh.employee_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_bonuses_type ON module_c_rh.employee_bonuses(bonus_type_id);

-- =============================================================================
-- 16. EMPLOYEE_SANCTIONS - Sanctions des employés
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.employee_sanctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    sanction_type_id UUID NOT NULL,
    level INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    fault_date DATE,
    fault_details TEXT,
    bonus_retention_percent DECIMAL(5,2) DEFAULT 0,
    suspension_start_date DATE,
    suspension_end_date DATE,
    suspension_days INTEGER DEFAULT 0,
    warning_type VARCHAR(20),
    sanctioned_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    sanction_date DATE NOT NULL,
    employee_signature_id UUID REFERENCES module_c_rh.electronic_signatures(id) ON DELETE SET NULL,
    employee_signed_at TIMESTAMP,
    employee_refused BOOLEAN DEFAULT false,
    refusal_reason TEXT,
    status VARCHAR(20) DEFAULT 'active',
    appeal_date TIMESTAMP,
    appeal_reason TEXT,
    appeal_resolution TEXT,
    appeal_resolved_at TIMESTAMP,
    notes TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_sanctions_employee ON module_c_rh.employee_sanctions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sanctions_org ON module_c_rh.employee_sanctions(organization_id);

-- =============================================================================
-- 17. GUARDIAN_QUESTIONS - Questions du Gardien (LiveYDream)
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.guardian_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    question_date DATE NOT NULL,
    q1_client_interest BOOLEAN DEFAULT false,
    q2_reputation BOOLEAN DEFAULT false,
    q3_engagement BOOLEAN DEFAULT false,
    q4_respectful_relations BOOLEAN DEFAULT false,
    q5_success_contribution BOOLEAN DEFAULT false,
    yes_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guardian_questions_employee ON module_c_rh.guardian_questions(employee_id);
CREATE INDEX IF NOT EXISTS idx_guardian_questions_date ON module_c_rh.guardian_questions(question_date);

-- =============================================================================
-- 18. DAILY_JOURNALS - Journaux de bord quotidiens
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.daily_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    journal_date DATE NOT NULL,
    accomplishments TEXT,
    challenges TEXT,
    learnings TEXT,
    tomorrow_plan TEXT,
    mood TEXT,
    productivity_score DECIMAL(3,1),
    is_submitted BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP,
    reviewed_by UUID REFERENCES module_c_rh.employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    manager_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_journals_employee ON module_c_rh.daily_journals(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_journals_date ON module_c_rh.daily_journals(journal_date);

-- =============================================================================
-- 19. EMPLOYEE_INITIATIONS - Initiation des nouveaux membres
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.employee_initiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    manifesto_sent BOOLEAN DEFAULT false,
    manifesto_sent_at TIMESTAMP,
    quiz_completed BOOLEAN DEFAULT false,
    quiz_score INTEGER,
    quiz_completed_at TIMESTAMP,
    quiz_attempts INTEGER DEFAULT 0,
    sponsor_id UUID REFERENCES module_c_rh.employees(id) ON DELETE SET NULL,
    sponsor_assigned_at TIMESTAMP,
    team_presentation_done BOOLEAN DEFAULT false,
    team_presentation_at TIMESTAMP,
    oath_signed BOOLEAN DEFAULT false,
    oath_signed_at TIMESTAMP,
    oath_document_url TEXT,
    identity_element_received BOOLEAN DEFAULT false,
    identity_element_at TIMESTAMP,
    identity_element_notes TEXT,
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 6,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_initiations_employee ON module_c_rh.employee_initiations(employee_id);

-- =============================================================================
-- 20. COMPANY_RITUALS - Rituels d'entreprise
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.company_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ritual_type VARCHAR(20) NOT NULL,
    scheduled_time TIME,
    day_of_week INTEGER,
    day_of_month INTEGER,
    duration_minutes INTEGER DEFAULT 15,
    participant_roles TEXT,
    checklist_items TEXT,
    is_mandatory BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_rituals_org ON module_c_rh.company_rituals(organization_id);

-- =============================================================================
-- 21. RITUAL_OCCURRENCES - Occurrences de rituels
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.ritual_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ritual_id UUID NOT NULL REFERENCES module_c_rh.company_rituals(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    actual_start_time TIME,
    actual_end_time TIME,
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    attendees TEXT,
    absentees TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ritual_occurrences_ritual ON module_c_rh.ritual_occurrences(ritual_id);
CREATE INDEX IF NOT EXISTS idx_ritual_occurrences_date ON module_c_rh.ritual_occurrences(occurrence_date);

-- =============================================================================
-- 22. RITUAL_PARTICIPANTS - Participants aux rituels
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.ritual_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurrence_id UUID NOT NULL REFERENCES module_c_rh.ritual_occurrences(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    is_present BOOLEAN DEFAULT false,
    contribution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ritual_participants_occurrence ON module_c_rh.ritual_participants(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ritual_participants_employee ON module_c_rh.ritual_participants(employee_id);

-- =============================================================================
-- 23. HR_TICKETS - Tickets SAV RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    category_id UUID NOT NULL,
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'open',
    assigned_to UUID REFERENCES core.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP,
    resolved_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    resolution_type VARCHAR(50),
    due_date DATE,
    first_response_at TIMESTAMP,
    satisfaction_rating INTEGER,
    satisfaction_comment TEXT,
    source VARCHAR(20) DEFAULT 'portal',
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_tickets_org ON module_c_rh.hr_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_tickets_employee ON module_c_rh.hr_tickets(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_tickets_status ON module_c_rh.hr_tickets(status);

-- =============================================================================
-- 24. HR_TICKET_COMMENTS - Commentaires sur tickets RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES module_c_rh.hr_tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_ticket_comments_ticket ON module_c_rh.hr_ticket_comments(ticket_id);

-- =============================================================================
-- 25. HR_TICKET_CATEGORIES - Catégories de tickets RH
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.hr_ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES module_c_rh.hr_ticket_categories(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_ticket_categories_org ON module_c_rh.hr_ticket_categories(organization_id);

-- =============================================================================
-- 26. GEOFENCE_ZONES - Zones de géofencing
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.geofence_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    center_latitude DECIMAL(10,7),
    center_longitude DECIMAL(10,7),
    polygon_coordinates JSONB,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    radius INTEGER,
    zone_type VARCHAR(20) DEFAULT 'polygon',
    is_active BOOLEAN DEFAULT true,
    type VARCHAR(50) DEFAULT 'office',
    address TEXT,
    created_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geofence_zones_org ON module_c_rh.geofence_zones(organization_id);

-- =============================================================================
-- 27. INTERNAL_EVENTS - Événements internes
-- =============================================================================
CREATE TABLE IF NOT EXISTS module_c_rh.internal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_all_day BOOLEAN DEFAULT false,
    location VARCHAR(255),
    is_remote BOOLEAN DEFAULT false,
    organizer_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    target_departments JSONB DEFAULT '[]',
    target_employee_ids JSONB DEFAULT '[]',
    is_company_wide BOOLEAN DEFAULT true,
    recurrence_type VARCHAR(20),
    recurrence_end_date DATE,
    is_visible BOOLEAN DEFAULT true,
    requires_rsvp BOOLEAN DEFAULT false,
    attachments JSONB DEFAULT '[]',
    color VARCHAR(7) DEFAULT '#F09815',
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internal_events_org ON module_c_rh.internal_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_internal_events_dates ON module_c_rh.internal_events(start_date, end_date);

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================
COMMENT ON TABLE module_c_rh.attendances IS 'Présence des employés';
COMMENT ON TABLE module_c_rh.office_attendances IS 'Présence au bureau avec géolocalisation';
COMMENT ON TABLE module_c_rh.internal_regulations IS 'Règlements intérieurs';
COMMENT ON TABLE module_c_rh.regulation_documents IS 'Documents de règlement';
COMMENT ON TABLE module_c_rh.employee_regulation_assignments IS 'Assignations règlements aux employés';
COMMENT ON TABLE module_c_rh.electronic_signatures IS 'Signatures électroniques';
COMMENT ON TABLE module_c_rh.hr_documents IS 'Documents RH';
COMMENT ON TABLE module_c_rh.hr_document_assignments IS 'Assignations documents RH';
COMMENT ON TABLE module_c_rh.hr_document_type_configs IS 'Configuration types de documents RH';
COMMENT ON TABLE module_c_rh.kpis IS 'Indicateurs RH';
COMMENT ON TABLE module_c_rh.kpi_weights IS 'Pondérations KPI';
COMMENT ON TABLE module_c_rh.monthly_evaluations IS 'Évaluations mensuelles';
COMMENT ON TABLE module_c_rh.evaluation_kpi_scores IS 'Scores KPI par évaluation';
COMMENT ON TABLE module_c_rh.bonus_types IS 'Types de bonus';
COMMENT ON TABLE module_c_rh.employee_bonuses IS 'Bonus des employés';
COMMENT ON TABLE module_c_rh.employee_sanctions IS 'Sanctions des employés';
COMMENT ON TABLE module_c_rh.guardian_questions IS 'Questions du Gardien LiveYDream';
COMMENT ON TABLE module_c_rh.daily_journals IS 'Journaux de bord quotidiens';
COMMENT ON TABLE module_c_rh.employee_initiations IS 'Initiation des nouveaux membres';
COMMENT ON TABLE module_c_rh.company_rituals IS 'Rituels d entreprise';
COMMENT ON TABLE module_c_rh.ritual_occurrences IS 'Occurrences de rituels';
COMMENT ON TABLE module_c_rh.ritual_participants IS 'Participants aux rituels';
COMMENT ON TABLE module_c_rh.hr_tickets IS 'Tickets SAV RH';
COMMENT ON TABLE module_c_rh.hr_ticket_comments IS 'Commentaires sur tickets RH';
COMMENT ON TABLE module_c_rh.hr_ticket_categories IS 'Catégories de tickets RH';
COMMENT ON TABLE module_c_rh.geofence_zones IS 'Zones de géofencing';
COMMENT ON TABLE module_c_rh.internal_events IS 'Événements internes';

ALTER TABLE module_c_rh.employees 
ADD COLUMN IF NOT EXISTS work_start_time TIME,
ADD COLUMN IF NOT EXISTS work_end_time TIME,
ADD COLUMN IF NOT EXISTS work_hours_per_day DECIMAL(4,2);

ALTER TABLE module_c_rh.leave_requests
ADD COLUMN IF NOT EXISTS is_joker BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME;

CREATE TABLE IF NOT EXISTS module_c_rh.guardian_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    question_date DATE NOT NULL,
    q1_client_interest BOOLEAN DEFAULT FALSE,
    q2_reputation BOOLEAN DEFAULT FALSE,
    q3_engagement BOOLEAN DEFAULT FALSE,
    q4_respectful_relations BOOLEAN DEFAULT FALSE,
    q5_success_contribution BOOLEAN DEFAULT FALSE,
    yes_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, question_date)
);

CREATE INDEX IF NOT EXISTS idx_guardian_questions_employee ON module_c_rh.guardian_questions(employee_id);
CREATE INDEX IF NOT EXISTS idx_guardian_questions_date ON module_c_rh.guardian_questions(question_date);

-- 4. Créer table daily_journals
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
    is_submitted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP,
    reviewed_by UUID REFERENCES module_c_rh.employees(id),
    reviewed_at TIMESTAMP,
    manager_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, journal_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_journals_employee ON module_c_rh.daily_journals(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_journals_date ON module_c_rh.daily_journals(journal_date);

CREATE TABLE IF NOT EXISTS module_c_rh.employee_initiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Step 1: Manifeste
    manifesto_sent BOOLEAN DEFAULT FALSE,
    manifesto_sent_at TIMESTAMP,
    
    -- Step 2: Quiz
    quiz_completed BOOLEAN DEFAULT FALSE,
    quiz_score INTEGER,
    quiz_completed_at TIMESTAMP,
    quiz_attempts INTEGER DEFAULT 0,
    
    -- Step 3: Parrain
    sponsor_id UUID REFERENCES module_c_rh.employees(id),
    sponsor_assigned_at TIMESTAMP,
    
    -- Step 4: Présentation équipe
    team_presentation_done BOOLEAN DEFAULT FALSE,
    team_presentation_at TIMESTAMP,
    
    -- Step 5: Serment
    oath_signed BOOLEAN DEFAULT FALSE,
    oath_signed_at TIMESTAMP,
    oath_document_url TEXT,
    
    -- Step 6: Élément identité
    identity_element_received BOOLEAN DEFAULT FALSE,
    identity_element_at TIMESTAMP,
    identity_element_notes TEXT,
    
    -- Progress
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 6,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_initiations_employee ON module_c_rh.employee_initiations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_initiations_status ON module_c_rh.employee_initiations(status);

-- 6. Créer table company_rituals
CREATE TABLE IF NOT EXISTS module_c_rh.company_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ritual_type VARCHAR(20) NOT NULL CHECK (ritual_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    scheduled_time TIME,
    day_of_week INTEGER,
    day_of_month INTEGER,
    duration_minutes INTEGER DEFAULT 15,
    participant_roles TEXT,
    checklist_items TEXT,
    is_mandatory BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_rituals_org ON module_c_rh.company_rituals(organization_id);
CREATE INDEX IF NOT EXISTS idx_company_rituals_type ON module_c_rh.company_rituals(ritual_type);

-- 7. Créer table ritual_occurrences
CREATE TABLE IF NOT EXISTS module_c_rh.ritual_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ritual_id UUID NOT NULL REFERENCES module_c_rh.company_rituals(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    actual_start_time TIME,
    actual_end_time TIME,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    attendees TEXT,
    absentees TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ritual_occurrences_ritual ON module_c_rh.ritual_occurrences(ritual_id);
CREATE INDEX IF NOT EXISTS idx_ritual_occurrences_date ON module_c_rh.ritual_occurrences(occurrence_date);

-- 8. Créer table ritual_participants
CREATE TABLE IF NOT EXISTS module_c_rh.ritual_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurrence_id UUID NOT NULL REFERENCES module_c_rh.ritual_occurrences(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    is_present BOOLEAN DEFAULT FALSE,
    contribution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ritual_participants_occurrence ON module_c_rh.ritual_participants(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ritual_participants_employee ON module_c_rh.ritual_participants(employee_id);

-- 9. Insérer les rituels par défaut pour LiveYDream
INSERT INTO module_c_rh.company_rituals (organization_id, name, description, ritual_type, scheduled_time, day_of_week, day_of_month, duration_minutes, is_mandatory, is_active)
SELECT 
    id,
    'Stand-up Matin',
    'Réunion quotidienne de synchronisation - Les 5 Questions du Gardien',
    'daily',
    '08:30',
    NULL,
    NULL,
    15,
    TRUE,
    TRUE
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM module_c_rh.company_rituals WHERE name = 'Stand-up Matin' AND organization_id = core.organizations.id
);

INSERT INTO module_c_rh.company_rituals (organization_id, name, description, ritual_type, scheduled_time, day_of_week, day_of_month, duration_minutes, is_mandatory, is_active)
SELECT 
    id,
    'Débrief Fin de Journée',
    'Bilan rapide de fin de journée',
    'daily',
    '17:30',
    NULL,
    NULL,
    10,
    FALSE,
    TRUE
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM module_c_rh.company_rituals WHERE name = 'Débrief Fin de Journée' AND organization_id = core.organizations.id
);

INSERT INTO module_c_rh.company_rituals (organization_id, name, description, ritual_type, scheduled_time, day_of_week, day_of_month, duration_minutes, is_mandatory, is_active)
SELECT 
    id,
    'Réunion Hebdomadaire',
    'Synthèse de la semaine et planification',
    'weekly',
    '09:00',
    1,
    NULL,
    60,
    TRUE,
    TRUE
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM module_c_rh.company_rituals WHERE name = 'Réunion Hebdomadaire' AND organization_id = core.organizations.id
);

INSERT INTO module_c_rh.company_rituals (organization_id, name, description, ritual_type, scheduled_time, day_of_week, day_of_month, duration_minutes, is_mandatory, is_active)
SELECT 
    id,
    'Assemblée Mensuelle',
    'Point mensuel de la Direction',
    'monthly',
    '09:00',
    NULL,
    1,
    120,
    TRUE,
    TRUE
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM module_c_rh.company_rituals WHERE name = 'Assemblée Mensuelle' AND organization_id = core.organizations.id
);

-- Commentaire de fin
SELECT 'Migration HR terminée avec succès!' AS status;


CREATE TABLE IF NOT EXISTS module_c_rh.employee_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    
    last_name VARCHAR(100),
    first_name VARCHAR(100),
    birth_date DATE,
    birth_place VARCHAR(255),
    nationality VARCHAR(100),
    marital_status VARCHAR(50),
    children_count INTEGER,
    gender VARCHAR(20),
    address TEXT,
    neighborhood VARCHAR(255),
    commune VARCHAR(100),
    city VARCHAR(100),
    phone_primary VARCHAR(20),
    phone_secondary VARCHAR(20),
    personal_email VARCHAR(255),
    id_number VARCHAR(50),
    id_expiry_date DATE,
    
    education_level VARCHAR(100),
    specialty VARCHAR(255),
    institutions_attended TEXT,
    previous_experience TEXT,
    key_skills TEXT,
    languages_spoken TEXT,
    
    emergency1_name VARCHAR(255),
    emergency1_relationship VARCHAR(100),
    emergency1_phone VARCHAR(20),
    emergency1_phone_secondary VARCHAR(20),
    emergency2_name VARCHAR(255),
    emergency2_relationship VARCHAR(100),
    emergency2_phone VARCHAR(20),
    emergency2_phone_secondary VARCHAR(20),
    
    blood_group VARCHAR(10),
    blood_rhesus VARCHAR(10),
    chronic_diseases TEXT,
    regular_medications TEXT,
    allergies TEXT,
    emergency_instructions TEXT,
    doctor_name VARCHAR(255),
    doctor_phone VARCHAR(20),
    reference_hospital VARCHAR(255),
    has_disability BOOLEAN,
    disability_details TEXT,
    
    transport_mode VARCHAR(100),
    has_personal_vehicle BOOLEAN,
    commute_time_minutes INTEGER,
    available_for_travel BOOLEAN,
    preferred_rest_days VARCHAR(255),
    personal_constraints TEXT,
    personal_resources TEXT,
    
    bank_name VARCHAR(255),
    bank_account_number VARCHAR(50),
    mobile_money_number VARCHAR(20),
    mobile_money_network VARCHAR(50),
    
    linkedin_url VARCHAR(255),
    instagram_url VARCHAR(255),
    tiktok_url VARCHAR(255),
    facebook_url VARCHAR(255),
    other_platforms TEXT,
    
    signature_date DATE,
    signature_place VARCHAR(255),
    signature_data TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    validated_at TIMESTAMP,
    validated_by UUID,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_employee_profiles_employee_id ON module_c_rh.employee_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_is_completed ON module_c_rh.employee_profiles(is_completed);

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_employee_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_employee_profiles_updated_at ON module_c_rh.employee_profiles;
CREATE TRIGGER trigger_employee_profiles_updated_at
    BEFORE UPDATE ON module_c_rh.employee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_employee_profiles_updated_at();

-- Commentaires sur les colonnes sensibles
COMMENT ON COLUMN module_c_rh.employee_profiles.chronic_diseases IS 'Confidentiel - Utilise uniquement en cas d urgence medicale';
COMMENT ON COLUMN module_c_rh.employee_profiles.regular_medications IS 'Confidentiel - Utilise uniquement en cas d urgence medicale';
COMMENT ON COLUMN module_c_rh.employee_profiles.allergies IS 'Confidentiel - Utilise uniquement en cas d urgence medicale';
COMMENT ON COLUMN module_c_rh.employee_profiles.emergency_instructions IS 'Confidentiel - Gestes a faire ou eviter en cas de malaise';
COMMENT ON COLUMN module_c_rh.employee_profiles.bank_name IS 'Confidentiel - Transmis uniquement au service comptable';
COMMENT ON COLUMN module_c_rh.employee_profiles.bank_account_number IS 'Confidentiel - Transmis uniquement au service comptable';
COMMENT ON COLUMN module_c_rh.employee_profiles.mobile_money_number IS 'Confidentiel - Transmis uniquement au service comptable';

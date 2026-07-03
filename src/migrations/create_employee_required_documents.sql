CREATE TABLE IF NOT EXISTS module_c_rh.employee_required_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES core.organizations(id),
    
    -- Type et statut
    document_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Fichier uploadé
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_mime_type VARCHAR(100),
    file_size BIGINT,
    
    -- Valeur texte 
    text_value VARCHAR(50),
    
    -- Date d'expiration
    expiry_date DATE,
    
    -- Validation
    validated_by UUID,
    validated_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Métadonnées
    is_optional BOOLEAN NOT NULL DEFAULT FALSE,
    due_date DATE NOT NULL,
    reminder_sent_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_document_type CHECK (document_type IN (
        'birth_certificate',
        'id_photo',
        'id_copy',
        'cv',
        'cover_letter',
        'diploma',
        'work_certificate',
        'criminal_record',
        'cnss_number',
        'info_form'
    )),
    CONSTRAINT chk_status CHECK (status IN (
        'pending',
        'uploaded',
        'validated',
        'rejected',
        'expired'
    ))
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_employee_required_docs_employee ON module_c_rh.employee_required_documents(employee_id);
CREATE INDEX idx_employee_required_docs_org ON module_c_rh.employee_required_documents(organization_id);
CREATE INDEX idx_employee_required_docs_status ON module_c_rh.employee_required_documents(status);
CREATE INDEX idx_employee_required_docs_due_date ON module_c_rh.employee_required_documents(due_date);
CREATE INDEX idx_employee_required_docs_reminder ON module_c_rh.employee_required_documents(reminder_sent_at) WHERE reminder_sent_at IS NULL;

-- Commentaires
COMMENT ON TABLE module_c_rh.employee_required_documents IS 'Documents obligatoires pour le dossier interne des collaborateurs';
COMMENT ON COLUMN module_c_rh.employee_required_documents.document_type IS 'Type de document: birth_certificate, id_photo, id_copy, cv, cover_letter, diploma, work_certificate, criminal_record, cnss_number, info_form';
COMMENT ON COLUMN module_c_rh.employee_required_documents.status IS 'Statut: pending, uploaded, validated, rejected, expired';
COMMENT ON COLUMN module_c_rh.employee_required_documents.due_date IS 'Date limite pour fournir le document';
COMMENT ON COLUMN module_c_rh.employee_required_documents.is_optional IS 'Si true, le document est optionnel (ex: CNSS, certificats de travail)';

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_employee_required_docs_updated_at 
    BEFORE UPDATE ON module_c_rh.employee_required_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

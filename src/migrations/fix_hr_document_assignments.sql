-- Migration: Ajouter colonnes manquantes à hr_document_assignments
-- Erreur: column assignment.organization_id does not exist

-- Ajouter organization_id
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Ajouter les autres colonnes manquantes
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS employee_id UUID;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS assigned_by UUID;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS total_time_spent INT DEFAULT 0;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS signature_id UUID;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS signature_image_url TEXT;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE module_c_rh.hr_document_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Vérification
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'module_c_rh' AND table_name = 'hr_document_assignments' 
ORDER BY ordinal_position;

-- Migration: Fix notifications table - add missing columns

-- Vérifier si is_read existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'is_read'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Vérifier si read_at existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'read_at'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN read_at TIMESTAMP;
    END IF;
END $$;

-- Vérifier si type existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN type VARCHAR(50);
        -- Mettre à jour les enregistrements existants avec une valeur par défaut
        UPDATE core.notifications SET type = 'general' WHERE type IS NULL;
        ALTER TABLE core.notifications ALTER COLUMN type SET NOT NULL;
    END IF;
END $$;

-- Vérifier si title existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'title'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN title VARCHAR(255);
        UPDATE core.notifications SET title = 'Notification' WHERE title IS NULL;
        ALTER TABLE core.notifications ALTER COLUMN title SET NOT NULL;
    END IF;
END $$;

-- Vérifier si message existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'message'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN message TEXT;
    END IF;
END $$;

-- Vérifier si data existe, sinon l'ajouter
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'core' 
        AND table_name = 'notifications' 
        AND column_name = 'data'
    ) THEN
        ALTER TABLE core.notifications ADD COLUMN data JSONB;
    END IF;
END $$;

-- Créer l'index manquant
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON core.notifications(user_id, is_read);

-- Commentaires
COMMENT ON TABLE core.notifications IS 'Stores in-app notifications for users';
COMMENT ON COLUMN core.notifications.type IS 'Notification type: validation_request, validation_approved, validation_rejected, task_assigned, etc.';
COMMENT ON COLUMN core.notifications.data IS 'Additional data as JSON (taskId, projectId, etc.)';

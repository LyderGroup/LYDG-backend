-- Migration: Create notifications table for in-app notifications

CREATE TABLE IF NOT EXISTS core.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON core.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON core.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_organization ON core.notifications(organization_id);

-- Comment on table
COMMENT ON TABLE core.notifications IS 'Stores in-app notifications for users';
COMMENT ON COLUMN core.notifications.type IS 'Notification type: validation_request, validation_approved, validation_rejected, task_assigned, etc.';
COMMENT ON COLUMN core.notifications.data IS 'Additional data as JSON (taskId, projectId, etc.)';

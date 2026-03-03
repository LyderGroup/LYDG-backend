-- Migration: Create fcm_tokens table for Firebase Cloud Messaging

CREATE TABLE IF NOT EXISTS core.fcm_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    token TEXT NOT NULL,
    device_type VARCHAR(50),
    device_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: one token per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_fcm_tokens_user_token ON core.fcm_tokens(user_id, token);

-- Index for querying active tokens by user
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_active ON core.fcm_tokens(user_id, is_active);

-- Comment
COMMENT ON TABLE core.fcm_tokens IS 'Stores FCM tokens for push notifications';
COMMENT ON COLUMN core.fcm_tokens.token IS 'Firebase Cloud Messaging token';
COMMENT ON COLUMN core.fcm_tokens.device_type IS 'Device type: web, android, ios';

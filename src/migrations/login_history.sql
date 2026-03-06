-- Migration: Create login_history table
-- Description: Track user login history with device, browser, OS and IP information

CREATE TABLE IF NOT EXISTS core.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent VARCHAR(500),
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    login_status VARCHAR(10) DEFAULT 'success',
    failure_reason VARCHAR(255),
    login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON core.login_history(user_id);

-- Index for sorting by login time
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON core.login_history(login_at DESC);

-- Comment on table
COMMENT ON TABLE core.login_history IS 'Stores user login history with device and location information';

-- Add user management fields to users table
ALTER TABLE users
  ADD COLUMN voter_id VARCHAR(255) UNIQUE,
  ADD COLUMN first_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN last_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ALTER COLUMN password_hash DROP NOT NULL;

-- Add indexes for better query performance
CREATE INDEX idx_users_voter_id ON users(voter_id);
CREATE INDEX idx_users_disabled ON users(is_disabled);
CREATE INDEX idx_users_admin ON users(is_admin);

-- Add comments for documentation
COMMENT ON COLUMN users.voter_id IS 'External voter identifier (unique)';
COMMENT ON COLUMN users.first_name IS 'User first name';
COMMENT ON COLUMN users.last_name IS 'User last name';
COMMENT ON COLUMN users.is_admin IS 'Whether user has administrator privileges';
COMMENT ON COLUMN users.is_disabled IS 'Whether user account is disabled';

-- Create system settings table
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add index on setting_key for faster lookups
CREATE INDEX idx_system_settings_key ON system_settings(setting_key);

-- Add comments
COMMENT ON TABLE system_settings IS 'System-wide configuration settings';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique setting identifier';
COMMENT ON COLUMN system_settings.setting_value IS 'Setting value (stored as text)';

-- Insert initial system settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('non_admin_login_enabled', 'true');

-- Add watcher role to users table
-- Watchers are non-voting observers with read-only access to reports

-- Add is_watcher column
ALTER TABLE users
ADD COLUMN is_watcher BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for performance (similar to existing idx_users_admin)
CREATE INDEX idx_users_watcher ON users(is_watcher);

-- Add constraint to ensure role exclusivity
-- A user cannot be both admin and watcher
-- (Regular voters have both flags set to FALSE)
ALTER TABLE users
ADD CONSTRAINT users_role_exclusivity CHECK (
  NOT (is_admin = TRUE AND is_watcher = TRUE)
);

-- Add documentation comments
COMMENT ON COLUMN users.is_watcher IS 'Whether user has watcher privileges (read-only observer role). A user can only be admin, watcher, or voter (mutually exclusive roles).';
COMMENT ON CONSTRAINT users_role_exclusivity ON users IS 'Ensures a user cannot be both admin and watcher. Regular voters have both flags set to FALSE.';

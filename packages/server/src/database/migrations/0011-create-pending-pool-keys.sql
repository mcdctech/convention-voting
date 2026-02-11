-- Create pending_pool_keys table to track invalid pool keys from CSV imports
-- These are pool keys that users attempted to use but which don't exist in the pools table

CREATE TABLE pending_pool_keys (
  id SERIAL PRIMARY KEY,
  pool_key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Ensure each user-poolkey combination is unique
  UNIQUE (user_id, pool_key)
);

-- Add indexes for common query patterns
-- Index on pool_key for grouping/aggregation queries
CREATE INDEX idx_pending_pool_keys_pool_key ON pending_pool_keys(pool_key);

-- Index on user_id for user-specific lookups and CASCADE deletes
CREATE INDEX idx_pending_pool_keys_user_id ON pending_pool_keys(user_id);

-- Add comments for documentation
COMMENT ON TABLE pending_pool_keys IS 'Tracks pool keys from CSV imports that did not match existing pools';
COMMENT ON COLUMN pending_pool_keys.id IS 'Unique identifier';
COMMENT ON COLUMN pending_pool_keys.pool_key IS 'The pool key string that was attempted but not found';
COMMENT ON COLUMN pending_pool_keys.user_id IS 'Reference to the user who had this invalid pool key';
COMMENT ON COLUMN pending_pool_keys.created_at IS 'When this pending key was recorded';

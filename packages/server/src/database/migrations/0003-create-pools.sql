-- Create pools table
CREATE TABLE pools (
  id SERIAL PRIMARY KEY,
  pool_key VARCHAR(255) NOT NULL UNIQUE,
  pool_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX idx_pools_key ON pools(pool_key);
CREATE INDEX idx_pools_disabled ON pools(is_disabled);

-- Add comments for documentation
COMMENT ON TABLE pools IS 'Voting pools for organizing users';
COMMENT ON COLUMN pools.id IS 'Unique pool identifier';
COMMENT ON COLUMN pools.pool_key IS 'Unique pool key identifier';
COMMENT ON COLUMN pools.pool_name IS 'Human-readable pool name';
COMMENT ON COLUMN pools.description IS 'Pool description';
COMMENT ON COLUMN pools.is_disabled IS 'Whether pool is disabled';

-- Create user_pools junction table for many-to-many relationship
CREATE TABLE user_pools (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pool_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_user_pools_user_id ON user_pools(user_id);
CREATE INDEX idx_user_pools_pool_id ON user_pools(pool_id);

-- Add comments for documentation
COMMENT ON TABLE user_pools IS 'Association between users and pools';
COMMENT ON COLUMN user_pools.user_id IS 'Reference to user';
COMMENT ON COLUMN user_pools.pool_id IS 'Reference to pool';

-- Migration: Add pool_type column to pools table
-- Purpose: Categorize pools by their intended purpose (voter, watcher, meeting_admin)

-- Create pool_type enum
CREATE TYPE pool_type AS ENUM ('voter', 'watcher', 'meeting_admin');

-- Add pool_type column to pools table (NULL for legacy/uncategorized pools)
ALTER TABLE pools ADD COLUMN pool_type pool_type DEFAULT NULL;

-- Index for efficient filtering by pool_type
CREATE INDEX idx_pools_pool_type ON pools(pool_type);

-- Add comment for documentation
COMMENT ON COLUMN pools.pool_type IS 'Pool type categorization: voter (for quorum/voting), watcher (observers), meeting_admin (administrators), or NULL for legacy/general pools';

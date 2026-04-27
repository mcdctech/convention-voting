-- Migration: Multiple voter pools per meeting and meeting admin enhancements
-- Part of Issue #91 Part 2

-- 1. Create junction table for multiple voter pools per meeting
CREATE TABLE meeting_voter_pools (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, pool_id)
);

CREATE INDEX idx_meeting_voter_pools_meeting ON meeting_voter_pools(meeting_id);
CREATE INDEX idx_meeting_voter_pools_pool ON meeting_voter_pools(pool_id);

COMMENT ON TABLE meeting_voter_pools IS 'Junction table for associating multiple voter pools with a meeting';
COMMENT ON COLUMN meeting_voter_pools.meeting_id IS 'Reference to meeting';
COMMENT ON COLUMN meeting_voter_pools.pool_id IS 'Reference to voter pool';

-- 2. Rename admin_pool_id to meeting_admin_pool_id for clarity
ALTER TABLE meetings RENAME COLUMN admin_pool_id TO meeting_admin_pool_id;

-- Update comment for renamed column
COMMENT ON COLUMN meetings.meeting_admin_pool_id IS 'Auto-created pool of users who can administer this meeting (nullable)';

-- 3. Add is_meeting_admin user flag
ALTER TABLE users ADD COLUMN is_meeting_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_users_meeting_admin ON users(is_meeting_admin);

-- 4. Update role exclusivity constraint to include meeting_admin
-- First drop the existing constraint
ALTER TABLE users DROP CONSTRAINT users_role_exclusivity;

-- Add new constraint that includes meeting_admin
ALTER TABLE users ADD CONSTRAINT users_role_exclusivity CHECK (
  -- Only one of the three special roles can be true
  (CASE WHEN is_admin THEN 1 ELSE 0 END +
   CASE WHEN is_watcher THEN 1 ELSE 0 END +
   CASE WHEN is_meeting_admin THEN 1 ELSE 0 END) <= 1
);

COMMENT ON COLUMN users.is_meeting_admin IS 'Whether user has meeting admin privileges (can administer assigned meetings). A user can only be admin, watcher, meeting_admin, or voter (mutually exclusive roles).';
COMMENT ON CONSTRAINT users_role_exclusivity ON users IS 'Ensures a user can only have one special role: global admin, watcher, or meeting admin. Regular voters have all flags set to FALSE.';

-- 5. Migrate existing data: add quorum pools to junction table
-- This ensures existing meetings have their quorum pool in the voter pools list
INSERT INTO meeting_voter_pools (meeting_id, pool_id)
SELECT id, quorum_voting_pool_id FROM meetings WHERE quorum_voting_pool_id IS NOT NULL;

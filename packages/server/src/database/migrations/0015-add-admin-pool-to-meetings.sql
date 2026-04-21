-- Migration: Add admin_pool_id to meetings table
-- This allows meetings to have a designated pool of users who can administer the meeting
-- Global admins always have access; this pool is for meeting-scoped administrators

ALTER TABLE meetings ADD COLUMN admin_pool_id INTEGER REFERENCES pools(id) ON DELETE RESTRICT;

COMMENT ON COLUMN meetings.admin_pool_id IS 'Pool of users who can administer this meeting (nullable, global admins always have access)';

-- Index for efficient lookups when checking admin access
CREATE INDEX idx_meetings_admin_pool ON meetings(admin_pool_id) WHERE admin_pool_id IS NOT NULL;

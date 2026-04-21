-- Add watcher pool to meetings
-- Allows specifying which pool of users can observe this meeting as watchers

ALTER TABLE meetings ADD COLUMN watcher_pool_id INTEGER REFERENCES pools(id) ON DELETE RESTRICT;

COMMENT ON COLUMN meetings.watcher_pool_id IS 'Pool of users who can observe this meeting as watchers (nullable)';

-- Create index for faster lookups
CREATE INDEX idx_meetings_watcher_pool ON meetings(watcher_pool_id) WHERE watcher_pool_id IS NOT NULL;

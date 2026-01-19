-- Migration: Add quorum tracking for meetings
-- This enables tracking of voter activity and quorum calculation

-- Add quorum_called_at to meetings table
-- This marks when quorum calculation should stop tracking new activity
-- NULL means quorum has not been called yet (live counting mode)
ALTER TABLE meetings
ADD COLUMN quorum_called_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN meetings.quorum_called_at IS 'Timestamp when quorum was called. Activity after this time does not count toward quorum. NULL means quorum not yet called.';

-- Create activity_logs table for tracking user activity
-- Note: No meeting_id - activity is associated with meetings via query-time joins
-- based on user IDs and timestamps
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient quorum queries
-- These indexes optimize the common query patterns:
-- 1. Finding all activity for a user within a time range
-- 2. Finding all activity within a time range (for quorum calculation)
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at);

COMMENT ON TABLE activity_logs IS 'Logs of authenticated user activity for quorum tracking';
COMMENT ON COLUMN activity_logs.user_id IS 'User who performed the activity';
COMMENT ON COLUMN activity_logs.url_path IS 'URL path accessed (no query params, no request body for privacy)';
COMMENT ON COLUMN activity_logs.created_at IS 'Timestamp of the activity';

/**
 * Migration 0010: Add performance indexes
 *
 * Adds indexes to improve query performance for common operations:
 * - Ordering motions by voting_started_at
 * - Filtering motions by status and ordering by start time
 */

-- Add index on voting_started_at for ordering active motions
CREATE INDEX IF NOT EXISTS idx_motions_voting_started_at ON motions (voting_started_at);

-- Add composite index for common motion queries (active motions ordered by start time)
CREATE INDEX IF NOT EXISTS idx_motions_status_voting_started_at
ON motions (status, voting_started_at DESC NULLS LAST);

-- Add index on votes for faster vote existence checks
CREATE INDEX IF NOT EXISTS idx_votes_user_motion ON votes (user_id, motion_id);

-- Add comment documenting the indexes
COMMENT ON INDEX idx_motions_voting_started_at IS 'Improves ordering by voting start time';
COMMENT ON INDEX idx_motions_status_voting_started_at IS 'Improves filtered queries for active/completed motions';
COMMENT ON INDEX idx_votes_user_motion IS 'Improves vote existence checks (has user voted?)';

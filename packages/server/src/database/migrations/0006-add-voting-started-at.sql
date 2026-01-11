/**
 * Migration 0006: Add voting_started_at to motions table
 *
 * Adds an explicit timestamp for when voting was started on a motion,
 * rather than relying on updated_at which can change for other reasons.
 */

-- Add voting_started_at column to motions table
ALTER TABLE motions
ADD COLUMN voting_started_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN motions.voting_started_at IS 'Timestamp when voting was started (status changed to voting_active). NULL if voting has not started yet.';

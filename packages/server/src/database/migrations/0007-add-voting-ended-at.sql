/**
 * Migration 0007: Add voting_ended_at to motions table
 *
 * Adds an explicit timestamp for when voting was ended on a motion,
 * rather than relying on updated_at which can change for other reasons.
 */

-- Add voting_ended_at column to motions table
ALTER TABLE motions
ADD COLUMN voting_ended_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN motions.voting_ended_at IS 'Timestamp when voting was ended (status changed to voting_complete). NULL if voting has not ended yet.';

-- Migration: Create votes tables for recording user votes on motions
-- This migration creates the votes table and vote_choices junction table
-- for tracking which choices each user selected.

-- Create votes table
-- Records one vote per user per motion
CREATE TABLE votes (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  motion_id INTEGER NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
  is_abstain BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT votes_unique_user_motion UNIQUE (user_id, motion_id)
);

-- Create vote_choices junction table
-- Records which choices were selected for each vote (for multi-seat elections)
CREATE TABLE vote_choices (
  id SERIAL PRIMARY KEY,
  vote_id INTEGER NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  choice_id INTEGER NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT vote_choices_unique UNIQUE (vote_id, choice_id)
);

-- Add indexes for better query performance
CREATE INDEX idx_votes_user_id ON votes(user_id);
CREATE INDEX idx_votes_motion_id ON votes(motion_id);
CREATE INDEX idx_votes_created_at ON votes(created_at);
CREATE INDEX idx_vote_choices_vote_id ON vote_choices(vote_id);
CREATE INDEX idx_vote_choices_choice_id ON vote_choices(choice_id);

-- Add comments for documentation
COMMENT ON TABLE votes IS 'Records user votes on motions';
COMMENT ON COLUMN votes.id IS 'Unique vote identifier';
COMMENT ON COLUMN votes.user_id IS 'Reference to user who cast the vote';
COMMENT ON COLUMN votes.motion_id IS 'Reference to motion being voted on';
COMMENT ON COLUMN votes.is_abstain IS 'True if user abstained from voting';
COMMENT ON COLUMN votes.created_at IS 'Timestamp when vote was cast';

COMMENT ON TABLE vote_choices IS 'Junction table linking votes to selected choices';
COMMENT ON COLUMN vote_choices.id IS 'Unique vote choice identifier';
COMMENT ON COLUMN vote_choices.vote_id IS 'Reference to parent vote';
COMMENT ON COLUMN vote_choices.choice_id IS 'Reference to selected choice';
COMMENT ON COLUMN vote_choices.created_at IS 'Timestamp when choice was recorded';

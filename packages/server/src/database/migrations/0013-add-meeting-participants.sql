-- Create participant_role enum type
CREATE TYPE participant_role AS ENUM ('voter', 'watcher', 'meeting_admin');

COMMENT ON TYPE participant_role IS 'Role of a participant in a meeting: voter, watcher, or meeting_admin';

-- Create meeting_participants table
-- Tracks which users have joined which meetings and in what capacity
CREATE TABLE meeting_participants (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  role participant_role NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  quorum_counted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for finding a user's active participation (left_at IS NULL)
CREATE INDEX idx_meeting_participants_user_active ON meeting_participants(user_id) WHERE left_at IS NULL;

-- Index for finding participants in a meeting
CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);

-- Index for finding all participations by user
CREATE INDEX idx_meeting_participants_user ON meeting_participants(user_id);

-- Index for quorum counting (voters who have been counted)
CREATE INDEX idx_meeting_participants_quorum ON meeting_participants(meeting_id)
  WHERE role = 'voter' AND quorum_counted_at IS NOT NULL;

-- Add comments for meeting_participants
COMMENT ON TABLE meeting_participants IS 'Tracks user participation in meetings';
COMMENT ON COLUMN meeting_participants.id IS 'Unique participation record identifier';
COMMENT ON COLUMN meeting_participants.user_id IS 'Reference to the participating user';
COMMENT ON COLUMN meeting_participants.meeting_id IS 'Reference to the meeting being participated in';
COMMENT ON COLUMN meeting_participants.role IS 'Role of the participant: voter, watcher, or meeting_admin';
COMMENT ON COLUMN meeting_participants.joined_at IS 'Timestamp when user joined the meeting';
COMMENT ON COLUMN meeting_participants.left_at IS 'Timestamp when user left the meeting (NULL if still active)';
COMMENT ON COLUMN meeting_participants.quorum_counted_at IS 'Timestamp when user was counted for quorum (NULL if not counted, only applies to voters)';
COMMENT ON COLUMN meeting_participants.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN meeting_participants.updated_at IS 'Timestamp when record was last updated';

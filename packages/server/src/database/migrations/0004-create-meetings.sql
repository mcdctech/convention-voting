-- Create motion_status enum type
CREATE TYPE motion_status AS ENUM ('not_yet_started', 'voting_active', 'voting_complete');

COMMENT ON TYPE motion_status IS 'Status of a motion: not_yet_started (default), voting_active, voting_complete';

-- Create meetings table
CREATE TABLE meetings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  quorum_voting_pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT meetings_valid_dates CHECK (end_date > start_date)
);

-- Add indexes for meetings
CREATE INDEX idx_meetings_start_date ON meetings(start_date);
CREATE INDEX idx_meetings_end_date ON meetings(end_date);
CREATE INDEX idx_meetings_quorum_pool ON meetings(quorum_voting_pool_id);

-- Add comments for meetings
COMMENT ON TABLE meetings IS 'Convention meetings';
COMMENT ON COLUMN meetings.id IS 'Unique meeting identifier';
COMMENT ON COLUMN meetings.name IS 'Meeting name';
COMMENT ON COLUMN meetings.description IS 'Meeting description';
COMMENT ON COLUMN meetings.start_date IS 'Meeting start date and time';
COMMENT ON COLUMN meetings.end_date IS 'Meeting end date and time';
COMMENT ON COLUMN meetings.quorum_voting_pool_id IS 'Pool used to determine quorum (required)';
COMMENT ON COLUMN meetings.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN meetings.updated_at IS 'Timestamp when record was last updated';

-- Create motions table
CREATE TABLE motions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  planned_duration INTEGER NOT NULL,
  seat_count INTEGER NOT NULL DEFAULT 1,
  voting_pool_id INTEGER REFERENCES pools(id) ON DELETE RESTRICT,
  status motion_status NOT NULL DEFAULT 'not_yet_started',
  end_override TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT motions_valid_duration CHECK (planned_duration > 0),
  CONSTRAINT motions_valid_seat_count CHECK (seat_count >= 1)
);

-- Add indexes for motions
CREATE INDEX idx_motions_meeting_id ON motions(meeting_id);
CREATE INDEX idx_motions_status ON motions(status);
CREATE INDEX idx_motions_voting_pool ON motions(voting_pool_id);
CREATE INDEX idx_motions_created_at ON motions(created_at);

-- Add comments for motions
COMMENT ON TABLE motions IS 'Motions within meetings for voting';
COMMENT ON COLUMN motions.id IS 'Unique motion identifier';
COMMENT ON COLUMN motions.meeting_id IS 'Reference to parent meeting';
COMMENT ON COLUMN motions.name IS 'Motion name';
COMMENT ON COLUMN motions.description IS 'Motion description';
COMMENT ON COLUMN motions.planned_duration IS 'Planned duration in minutes';
COMMENT ON COLUMN motions.seat_count IS 'Number of seats/positions to elect (default 1)';
COMMENT ON COLUMN motions.voting_pool_id IS 'Pool of eligible voters (optional)';
COMMENT ON COLUMN motions.status IS 'Motion status: not_yet_started, voting_active, voting_complete';
COMMENT ON COLUMN motions.end_override IS 'Override timestamp for voting end (only when voting_active)';
COMMENT ON COLUMN motions.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN motions.updated_at IS 'Timestamp when record was last updated';

-- Create choices table
CREATE TABLE choices (
  id SERIAL PRIMARY KEY,
  motion_id INTEGER NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add indexes for choices
CREATE INDEX idx_choices_motion_id ON choices(motion_id);
CREATE INDEX idx_choices_sort_order ON choices(motion_id, sort_order);

-- Add comments for choices
COMMENT ON TABLE choices IS 'Choices for motion voting';
COMMENT ON COLUMN choices.id IS 'Unique choice identifier';
COMMENT ON COLUMN choices.motion_id IS 'Reference to parent motion';
COMMENT ON COLUMN choices.name IS 'Choice name/label';
COMMENT ON COLUMN choices.sort_order IS 'Display order (0-indexed)';
COMMENT ON COLUMN choices.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN choices.updated_at IS 'Timestamp when record was last updated';

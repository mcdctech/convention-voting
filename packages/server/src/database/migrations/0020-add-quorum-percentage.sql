-- Migration: Add quorum percentage configuration to meetings
-- Issue #128: Configurable quorum percentage per meeting

-- Add quorum_percentage column to meetings table
-- Default to 50 for existing meetings (maintains current behavior)
ALTER TABLE meetings
ADD COLUMN quorum_percentage DECIMAL(5,2) NOT NULL DEFAULT 50.00;

-- Add quorum_eligible_snapshot column
-- Stores the eligible voter count when quorum is called (frozen value)
-- This ensures quorum reports don't change if pool membership changes after quorum is called
ALTER TABLE meetings
ADD COLUMN quorum_eligible_snapshot INTEGER NULL;

-- Add comments for documentation
COMMENT ON COLUMN meetings.quorum_percentage IS
  'Percentage of quorum pool members required to achieve quorum (0-100)';

COMMENT ON COLUMN meetings.quorum_eligible_snapshot IS
  'Snapshot of eligible voter count when quorum was called. NULL if quorum not yet called.';

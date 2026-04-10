-- Migration: Rename seat_count to selection_count
-- Issue: #32 - Rename seat_count to selection_count in database schema
-- Description: Rename column and constraint for consistency with UI terminology

-- Rename the column
ALTER TABLE motions RENAME COLUMN seat_count TO selection_count;

-- Rename the constraint
ALTER TABLE motions RENAME CONSTRAINT motions_valid_seat_count TO motions_valid_selection_count;

-- Update the column comment
COMMENT ON COLUMN motions.selection_count IS 'Number of selections/positions to elect (default 1)';

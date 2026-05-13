-- Migration: Create meeting_documents table
-- Stores PDF documents associated with meetings (or system-wide like user guide)

-- Create document category enum
CREATE TYPE document_category AS ENUM (
    'invitation',
    'agenda',
    'reports',
    'previous_meeting_issues',
    'proposals',
    'rules',
    'user_guide'
);

-- Create meeting_documents table
CREATE TABLE meeting_documents (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    category document_category NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),

    -- meeting_id is NULL for system-wide documents (user_guide)
    -- meeting_id must be NOT NULL for all other categories
    CONSTRAINT valid_meeting_or_system CHECK (
        (meeting_id IS NOT NULL AND category != 'user_guide') OR
        (meeting_id IS NULL AND category = 'user_guide')
    )
);

-- Index for efficient lookups by meeting
CREATE INDEX idx_meeting_documents_meeting_id ON meeting_documents(meeting_id);

-- Index for finding system-wide documents
CREATE INDEX idx_meeting_documents_category ON meeting_documents(category);

-- Comment on table
COMMENT ON TABLE meeting_documents IS 'Stores PDF documents associated with meetings or system-wide (user guide)';
COMMENT ON COLUMN meeting_documents.meeting_id IS 'NULL for system-wide documents like user_guide';
COMMENT ON COLUMN meeting_documents.filename IS 'Stored filename (UUID-based) in uploads directory';
COMMENT ON COLUMN meeting_documents.original_filename IS 'Original filename from upload';

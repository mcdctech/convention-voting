-- Migration: Add document linking capability
-- Allows documents to be linked to multiple meetings without duplication

-- Junction table for document-meeting links
CREATE TABLE document_meeting_links (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES meeting_documents(id) ON DELETE CASCADE,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    linked_by_user_id UUID NOT NULL REFERENCES users(id),
    UNIQUE (document_id, meeting_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_document_meeting_links_document ON document_meeting_links(document_id);
CREATE INDEX idx_document_meeting_links_meeting ON document_meeting_links(meeting_id);

COMMENT ON TABLE document_meeting_links IS 'Links documents from one meeting to other meetings without duplication';
COMMENT ON COLUMN document_meeting_links.document_id IS 'The source document being linked';
COMMENT ON COLUMN document_meeting_links.meeting_id IS 'The target meeting receiving the link';
COMMENT ON COLUMN document_meeting_links.linked_at IS 'When the link was created';
COMMENT ON COLUMN document_meeting_links.linked_by_user_id IS 'Admin who created the link';

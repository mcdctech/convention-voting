/**
 * Document management service
 *
 * Handles PDF document upload, storage, and retrieval for meetings.
 * Documents are stored in the local filesystem organized by meeting.
 * System-wide documents (user guide) are stored separately.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import pino from "pino";
import {
	DocumentCategory,
	ServiceErrorCode,
	type MeetingDocument,
	type LinkableDocument,
	type DocumentLink,
} from "@mcdc-convention-voting/shared";
import { db } from "../database/db.js";
import { ServiceError } from "../errors/service-error.js";

const logger = pino({ name: "document-service" });

// File size constants
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * BYTES_PER_MB;

// Array constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Radix for parseInt
const DECIMAL_RADIX = 10;

// Uploads directory (relative to project root)
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MEETINGS_DIR = path.join(UPLOADS_DIR, "meetings");
const SYSTEM_DIR = path.join(UPLOADS_DIR, "system");

// Allowed MIME types
const ALLOWED_MIME_TYPES = ["application/pdf"];

/**
 * Database row type for meeting_documents
 */
interface DocumentDbRow {
	id: number;
	meeting_id: number | null;
	category: string;
	filename: string;
	original_filename: string;
	file_size: number;
	mime_type: string;
	uploaded_at: Date;
	uploaded_by_user_id: string;
}

/**
 * Database row type for document_meeting_links
 */
interface DocumentLinkDbRow {
	id: number;
	document_id: number;
	meeting_id: number;
	linked_at: Date;
	linked_by_user_id: string;
}

/**
 * Database row type for linkable documents query
 */
interface LinkableDocumentDbRow {
	id: number;
	category: string;
	original_filename: string;
	meeting_id: number;
	meeting_name: string;
	uploaded_at: Date;
}

/**
 * Database row type for linked document query (joined with source meeting)
 */
interface LinkedDocumentDbRow extends DocumentDbRow {
	is_linked: boolean;
	source_meeting_id: number;
	source_meeting_name: string;
}

/**
 * Map database category string to DocumentCategory enum
 */
function mapDocumentCategory(dbCategory: string): DocumentCategory {
	switch (dbCategory) {
		case "invitation":
			return DocumentCategory.Invitation;
		case "agenda":
			return DocumentCategory.Agenda;
		case "reports":
			return DocumentCategory.Reports;
		case "previous_meeting_issues":
			return DocumentCategory.PreviousMeetingIssues;
		case "proposals":
			return DocumentCategory.Proposals;
		case "rules":
			return DocumentCategory.Rules;
		case "user_guide":
			return DocumentCategory.UserGuide;
		default:
			return DocumentCategory.Invitation;
	}
}

/**
 * Map a database row to a MeetingDocument object
 */
function mapRowToDocument(row: DocumentDbRow): MeetingDocument {
	return {
		id: row.id,
		meetingId: row.meeting_id,
		category: mapDocumentCategory(row.category),
		filename: row.filename,
		originalFilename: row.original_filename,
		fileSize: row.file_size,
		mimeType: row.mime_type,
		uploadedAt: row.uploaded_at,
		uploadedByUserId: row.uploaded_by_user_id,
	};
}

/**
 * Ensure upload directories exist
 */
function ensureUploadDirectories(): void {
	if (!fs.existsSync(UPLOADS_DIR)) {
		fs.mkdirSync(UPLOADS_DIR, { recursive: true });
	}
	if (!fs.existsSync(MEETINGS_DIR)) {
		fs.mkdirSync(MEETINGS_DIR, { recursive: true });
	}
	if (!fs.existsSync(SYSTEM_DIR)) {
		fs.mkdirSync(SYSTEM_DIR, { recursive: true });
	}
}

/**
 * Ensure meeting directory exists
 */
function ensureMeetingDirectory(meetingId: number): string {
	const meetingDir = path.join(MEETINGS_DIR, String(meetingId));
	if (!fs.existsSync(meetingDir)) {
		fs.mkdirSync(meetingDir, { recursive: true });
	}
	return meetingDir;
}

/**
 * Generate a unique filename for storage
 */
function generateStoredFilename(originalFilename: string): string {
	const ext = path.extname(originalFilename);
	return `${randomUUID()}${ext}`;
}

/**
 * Validate file for upload
 */
function validateFile(
	file: Express.Multer.File,
): { valid: true } | { valid: false; error: string } {
	// Check file size
	if (file.size > MAX_FILE_SIZE_BYTES) {
		return {
			valid: false,
			error: `File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`,
		};
	}

	// Check MIME type
	if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
		return {
			valid: false,
			error: `Invalid file type. Only PDF files are allowed.`,
		};
	}

	return { valid: true };
}

/**
 * Get the file path for a document
 */
export function getDocumentFilePath(document: MeetingDocument): string {
	if (document.meetingId === null) {
		return path.join(SYSTEM_DIR, document.filename);
	}
	return path.join(MEETINGS_DIR, String(document.meetingId), document.filename);
}

/**
 * Upload a document for a meeting
 *
 * If a document with the same category already exists for this meeting,
 * it will be replaced (deleted and new one created).
 */
export async function uploadMeetingDocument(
	meetingId: number,
	category: DocumentCategory,
	file: Express.Multer.File,
	uploadedByUserId: string,
): Promise<MeetingDocument> {
	ensureUploadDirectories();

	// Validate file
	const validation = validateFile(file);
	if (!validation.valid) {
		throw new ServiceError(ServiceErrorCode.INVALID_INPUT, validation.error);
	}

	// Verify meeting exists
	const meetingCheck = await db.query<{ id: number }>(
		`SELECT id FROM meetings WHERE id = :meetingId`,
		{ meetingId },
	);
	if (meetingCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.MEETING_NOT_FOUND,
			"Meeting not found",
		);
	}

	// Check if document with this category already exists - delete if so
	const existingDoc = await db.query<DocumentDbRow>(
		`SELECT * FROM meeting_documents
		 WHERE meeting_id = :meetingId AND category = :category`,
		{ meetingId, category },
	);
	if (existingDoc.rows.length > EMPTY_ARRAY_LENGTH) {
		const existing = mapRowToDocument(existingDoc.rows[FIRST_ROW]);
		const existingPath = getDocumentFilePath(existing);
		if (fs.existsSync(existingPath)) {
			fs.unlinkSync(existingPath);
		}
		await db.query(`DELETE FROM meeting_documents WHERE id = :id`, {
			id: existing.id,
		});
		logger.info(
			{ meetingId, category, deletedId: existing.id },
			"Deleted existing document before replacement",
		);
	}

	// Generate filename and save file
	const meetingDir = ensureMeetingDirectory(meetingId);
	const storedFilename = generateStoredFilename(file.originalname);
	const filePath = path.join(meetingDir, storedFilename);
	fs.writeFileSync(filePath, file.buffer);

	// Insert into database
	const result = await db.query<DocumentDbRow>(
		`INSERT INTO meeting_documents (
			meeting_id,
			category,
			filename,
			original_filename,
			file_size,
			mime_type,
			uploaded_by_user_id
		) VALUES (
			:meetingId,
			:category,
			:storedFilename,
			:originalFilename,
			:fileSize,
			:mimeType,
			:uploadedByUserId
		)
		RETURNING *`,
		{
			meetingId,
			category,
			storedFilename,
			originalFilename: file.originalname,
			fileSize: file.size,
			mimeType: file.mimetype,
			uploadedByUserId,
		},
	);

	logger.info(
		{ meetingId, category, documentId: result.rows[FIRST_ROW].id },
		"Document uploaded successfully",
	);

	return mapRowToDocument(result.rows[FIRST_ROW]);
}

/**
 * Upload or replace the system user guide
 */
export async function uploadUserGuide(
	file: Express.Multer.File,
	uploadedByUserId: string,
): Promise<MeetingDocument> {
	ensureUploadDirectories();

	// Validate file
	const validation = validateFile(file);
	if (!validation.valid) {
		throw new ServiceError(ServiceErrorCode.INVALID_INPUT, validation.error);
	}

	// Check if user guide already exists - delete if so
	const existingDoc = await db.query<DocumentDbRow>(
		`SELECT * FROM meeting_documents
		 WHERE category = 'user_guide' AND meeting_id IS NULL`,
		{},
	);
	if (existingDoc.rows.length > EMPTY_ARRAY_LENGTH) {
		const existing = mapRowToDocument(existingDoc.rows[FIRST_ROW]);
		const existingPath = getDocumentFilePath(existing);
		if (fs.existsSync(existingPath)) {
			fs.unlinkSync(existingPath);
		}
		await db.query(`DELETE FROM meeting_documents WHERE id = :id`, {
			id: existing.id,
		});
		logger.info(
			{ deletedId: existing.id },
			"Deleted existing user guide before replacement",
		);
	}

	// Generate filename and save file
	const storedFilename = generateStoredFilename(file.originalname);
	const filePath = path.join(SYSTEM_DIR, storedFilename);
	fs.writeFileSync(filePath, file.buffer);

	// Insert into database
	const result = await db.query<DocumentDbRow>(
		`INSERT INTO meeting_documents (
			meeting_id,
			category,
			filename,
			original_filename,
			file_size,
			mime_type,
			uploaded_by_user_id
		) VALUES (
			NULL,
			'user_guide',
			:storedFilename,
			:originalFilename,
			:fileSize,
			:mimeType,
			:uploadedByUserId
		)
		RETURNING *`,
		{
			storedFilename,
			originalFilename: file.originalname,
			fileSize: file.size,
			mimeType: file.mimetype,
			uploadedByUserId,
		},
	);

	logger.info(
		{ documentId: result.rows[FIRST_ROW].id },
		"User guide uploaded successfully",
	);

	return mapRowToDocument(result.rows[FIRST_ROW]);
}

/**
 * Get all documents for a meeting (including linked documents)
 *
 * Returns both:
 * - Documents directly uploaded to this meeting
 * - Documents linked from other meetings
 *
 * Linked documents have isLinked=true and sourceMeetingId/sourceMeetingName populated.
 */
export async function getDocumentsForMeeting(
	meetingId: number,
): Promise<MeetingDocument[]> {
	// Get directly uploaded documents
	const directResult = await db.query<DocumentDbRow>(
		`SELECT * FROM meeting_documents
		 WHERE meeting_id = :meetingId
		 ORDER BY category, uploaded_at DESC`,
		{ meetingId },
	);

	const directDocs = directResult.rows.map(mapRowToDocument);

	// Get linked documents with source meeting info
	const linkedResult = await db.query<LinkedDocumentDbRow>(
		`SELECT
			md.*,
			TRUE as is_linked,
			md.meeting_id as source_meeting_id,
			m.name as source_meeting_name
		 FROM document_meeting_links dml
		 JOIN meeting_documents md ON dml.document_id = md.id
		 JOIN meetings m ON md.meeting_id = m.id
		 WHERE dml.meeting_id = :meetingId
		 ORDER BY md.category, dml.linked_at DESC`,
		{ meetingId },
	);

	const linkedDocs = linkedResult.rows.map((row) => ({
		...mapRowToDocument(row),
		isLinked: true,
		sourceMeetingId: row.source_meeting_id,
		sourceMeetingName: row.source_meeting_name,
	}));

	return [...directDocs, ...linkedDocs];
}

/**
 * Get the user guide document
 */
export async function getUserGuide(): Promise<MeetingDocument | null> {
	const result = await db.query<DocumentDbRow>(
		`SELECT * FROM meeting_documents
		 WHERE category = 'user_guide' AND meeting_id IS NULL
		 LIMIT 1`,
		{},
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	return mapRowToDocument(result.rows[FIRST_ROW]);
}

/**
 * Get a document by ID
 */
export async function getDocumentById(
	documentId: number,
): Promise<MeetingDocument | null> {
	const result = await db.query<DocumentDbRow>(
		`SELECT * FROM meeting_documents WHERE id = :documentId`,
		{ documentId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	return mapRowToDocument(result.rows[FIRST_ROW]);
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: number): Promise<void> {
	const document = await getDocumentById(documentId);
	if (document === null) {
		throw new ServiceError(ServiceErrorCode.NOT_FOUND, "Document not found");
	}

	// Delete file from filesystem
	const filePath = getDocumentFilePath(document);
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}

	// Delete from database
	await db.query(`DELETE FROM meeting_documents WHERE id = :documentId`, {
		documentId,
	});

	logger.info(
		{ documentId, meetingId: document.meetingId, category: document.category },
		"Document deleted successfully",
	);
}

/**
 * Check if a user can manage documents for a meeting
 * Returns true if user is admin or is a meeting admin for this meeting
 */
export async function canManageMeetingDocuments(
	userId: string,
	meetingId: number,
): Promise<boolean> {
	// Check if user is admin
	const userResult = await db.query<{ is_admin: boolean }>(
		`SELECT is_admin FROM users WHERE id = :userId`,
		{ userId },
	);
	if (
		userResult.rows.length > EMPTY_ARRAY_LENGTH &&
		userResult.rows[FIRST_ROW].is_admin
	) {
		return true;
	}

	// Check if user is meeting admin for this meeting
	const meetingResult = await db.query<{
		meeting_admin_pool_id: number | null;
	}>(`SELECT meeting_admin_pool_id FROM meetings WHERE id = :meetingId`, {
		meetingId,
	});

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return false;
	}

	const {
		rows: [{ meeting_admin_pool_id: poolId }],
	} = meetingResult;

	if (poolId === null) {
		return false;
	}

	const memberResult = await db.query<{ user_id: string }>(
		`SELECT user_id FROM user_pools WHERE user_id = :userId AND pool_id = :poolId`,
		{ userId, poolId },
	);

	return memberResult.rows.length > EMPTY_ARRAY_LENGTH;
}

/**
 * Check if a user can view documents for a meeting
 * Returns true if user is in any of the meeting's pools
 */
export async function canViewMeetingDocuments(
	userId: string,
	meetingId: number,
): Promise<boolean> {
	// Get all pool IDs for this meeting
	const poolResult = await db.query<{ pool_id: number }>(
		`SELECT DISTINCT pool_id FROM (
			SELECT quorum_voting_pool_id AS pool_id FROM meetings WHERE id = :meetingId
			UNION ALL
			SELECT watcher_pool_id AS pool_id FROM meetings WHERE id = :meetingId AND watcher_pool_id IS NOT NULL
			UNION ALL
			SELECT meeting_admin_pool_id AS pool_id FROM meetings WHERE id = :meetingId AND meeting_admin_pool_id IS NOT NULL
			UNION ALL
			SELECT pool_id FROM meeting_voter_pools WHERE meeting_id = :meetingId
		) AS pools
		WHERE pool_id IS NOT NULL`,
		{ meetingId },
	);

	if (poolResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return false;
	}

	const poolIds = poolResult.rows.map((r) => r.pool_id);

	// Check if user is in any of these pools
	const memberResult = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM user_pools
		 WHERE user_id = :userId AND pool_id = ANY(:poolIds)`,
		{ userId, poolIds },
	);

	return (
		parseInt(memberResult.rows[FIRST_ROW].count, DECIMAL_RADIX) >
		EMPTY_ARRAY_LENGTH
	);
}

/**
 * Get documents from other meetings that can be linked to this meeting
 *
 * Filters by:
 * - Same category as specified
 * - From a different meeting
 * - Not already linked to this meeting
 */
export async function getLinkableDocuments(
	meetingId: number,
	category: DocumentCategory,
): Promise<LinkableDocument[]> {
	const result = await db.query<LinkableDocumentDbRow>(
		`SELECT
			md.id,
			md.category,
			md.original_filename,
			md.meeting_id,
			m.name as meeting_name,
			md.uploaded_at
		 FROM meeting_documents md
		 JOIN meetings m ON md.meeting_id = m.id
		 WHERE md.category = :category
		   AND md.meeting_id IS NOT NULL
		   AND md.meeting_id != :meetingId
		   AND md.id NOT IN (
			   SELECT document_id FROM document_meeting_links WHERE meeting_id = :meetingId
		   )
		 ORDER BY m.name, md.uploaded_at DESC`,
		{ meetingId, category },
	);

	return result.rows.map((row) => ({
		id: row.id,
		category: mapDocumentCategory(row.category),
		originalFilename: row.original_filename,
		meetingId: row.meeting_id,
		meetingName: row.meeting_name,
		uploadedAt: row.uploaded_at,
	}));
}

/**
 * Link a document to a meeting
 *
 * Validates:
 * - Document exists and has a meeting_id (not a system document)
 * - Target meeting exists
 * - Link doesn't already exist
 * - Document is not being linked to its own meeting
 * - No document of same category already exists in target meeting (uploaded or linked)
 */
export async function linkDocumentToMeeting(
	documentId: number,
	meetingId: number,
	linkedByUserId: string,
): Promise<MeetingDocument> {
	// Get the document
	const document = await getDocumentById(documentId);
	if (document === null) {
		throw new ServiceError(ServiceErrorCode.NOT_FOUND, "Document not found");
	}

	// Cannot link system documents (those without a meeting_id)
	if (document.meetingId === null) {
		throw new ServiceError(
			ServiceErrorCode.INVALID_INPUT,
			"Cannot link system documents",
		);
	}

	// Cannot link a document to its own meeting
	if (document.meetingId === meetingId) {
		throw new ServiceError(
			ServiceErrorCode.INVALID_INPUT,
			"Cannot link a document to its own meeting",
		);
	}

	// Verify target meeting exists
	const meetingCheck = await db.query<{ id: number; name: string }>(
		`SELECT id, name FROM meetings WHERE id = :meetingId`,
		{ meetingId },
	);
	if (meetingCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.MEETING_NOT_FOUND,
			"Target meeting not found",
		);
	}

	// Check if link already exists
	const existingLink = await db.query<{ id: number }>(
		`SELECT id FROM document_meeting_links
		 WHERE document_id = :documentId AND meeting_id = :meetingId`,
		{ documentId, meetingId },
	);
	if (existingLink.rows.length > EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.INVALID_INPUT,
			"Document is already linked to this meeting",
		);
	}

	// Check if a document with this category already exists (uploaded or linked)
	const existingCategory = await db.query<{ id: number }>(
		`SELECT id FROM meeting_documents
		 WHERE meeting_id = :meetingId AND category = :category
		 UNION
		 SELECT dml.id FROM document_meeting_links dml
		 JOIN meeting_documents md ON dml.document_id = md.id
		 WHERE dml.meeting_id = :meetingId AND md.category = :category`,
		{ meetingId, category: document.category },
	);
	if (existingCategory.rows.length > EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.INVALID_INPUT,
			"A document with this category already exists for the meeting",
		);
	}

	// Create the link
	await db.query<DocumentLinkDbRow>(
		`INSERT INTO document_meeting_links (document_id, meeting_id, linked_by_user_id)
		 VALUES (:documentId, :meetingId, :linkedByUserId)
		 RETURNING *`,
		{ documentId, meetingId, linkedByUserId },
	);

	logger.info(
		{ documentId, meetingId, linkedByUserId },
		"Document linked to meeting",
	);

	// Return the document with linked info
	return {
		...document,
		isLinked: true,
		sourceMeetingId: document.meetingId,
		sourceMeetingName: meetingCheck.rows[FIRST_ROW].name,
	};
}

/**
 * Unlink a document from a meeting
 *
 * Removes the link but does not delete the original document.
 */
export async function unlinkDocumentFromMeeting(
	documentId: number,
	meetingId: number,
): Promise<void> {
	const result = await db.query<{ id: number }>(
		`DELETE FROM document_meeting_links
		 WHERE document_id = :documentId AND meeting_id = :meetingId
		 RETURNING id`,
		{ documentId, meetingId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.NOT_FOUND,
			"Document link not found",
		);
	}

	logger.info({ documentId, meetingId }, "Document unlinked from meeting");
}

/**
 * Get document link by document and meeting
 */
export async function getDocumentLink(
	documentId: number,
	meetingId: number,
): Promise<DocumentLink | null> {
	const result = await db.query<DocumentLinkDbRow>(
		`SELECT * FROM document_meeting_links
		 WHERE document_id = :documentId AND meeting_id = :meetingId`,
		{ documentId, meetingId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		documentId: row.document_id,
		meetingId: row.meeting_id,
		linkedAt: row.linked_at,
		linkedByUserId: row.linked_by_user_id,
	};
}

/**
 * Public document routes for viewing and downloading meeting documents
 */
import * as fs from "node:fs";
import { Router, type Request, type Response } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import {
	getDocumentsForMeeting,
	getUserGuide,
	getDocumentById,
	getDocumentFilePath,
	canViewMeetingDocuments,
} from "../services/document-service.js";

export const documentsRouter = Router();

// Constants
const DECIMAL_RADIX = 10;

/**
 * GET /api/documents/user-guide/download
 * Download the system user guide
 * Accessible to all authenticated users
 */
documentsRouter.get(
	"/user-guide/download",
	async (req: Request, res: Response) => {
		try {
			const guide = await getUserGuide();

			if (guide === null) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					error: "User guide not found",
				});
				return;
			}

			const filePath = getDocumentFilePath(guide);

			if (!fs.existsSync(filePath)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					error: "User guide file not found",
				});
				return;
			}

			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${guide.originalFilename}"`,
			);
			res.setHeader("Content-Type", guide.mimeType);
			res.setHeader("Content-Length", guide.fileSize);

			const fileStream = fs.createReadStream(filePath);
			fileStream.pipe(res);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				error: `Failed to download user guide: ${message}`,
			});
		}
	},
);

/**
 * GET /api/documents/user-guide
 * Get user guide metadata
 * Accessible to all authenticated users
 */
documentsRouter.get("/user-guide", async (_req: Request, res: Response) => {
	try {
		const guide = await getUserGuide();

		res.json({ success: true, data: guide });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
			error: `Failed to get user guide: ${message}`,
		});
	}
});

/**
 * GET /api/documents/:id/download
 * Download a specific document
 * Requires user to have access to the meeting
 */
documentsRouter.get("/:id/download", async (req: Request, res: Response) => {
	try {
		const documentId = parseInt(req.params.id, DECIMAL_RADIX);
		const userId = req.user?.id;

		if (userId === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				error: "User not authenticated",
			});
			return;
		}

		const document = await getDocumentById(documentId);

		if (document === null) {
			res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
				error: "Document not found",
			});
			return;
		}

		// For meeting documents, check if user has access
		if (document.meetingId !== null) {
			const canView = await canViewMeetingDocuments(userId, document.meetingId);
			if (!canView) {
				res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
					error: "Not authorized to view this document",
				});
				return;
			}
		}

		const filePath = getDocumentFilePath(document);

		if (!fs.existsSync(filePath)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
				error: "Document file not found",
			});
			return;
		}

		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${document.originalFilename}"`,
		);
		res.setHeader("Content-Type", document.mimeType);
		res.setHeader("Content-Length", document.fileSize);

		const fileStream = fs.createReadStream(filePath);
		fileStream.pipe(res);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
			error: `Failed to download document: ${message}`,
		});
	}
});

/**
 * GET /api/documents/meeting/:meetingId
 * List all documents for a meeting
 * Requires user to have access to the meeting
 */
documentsRouter.get(
	"/meeting/:meetingId",
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.meetingId, DECIMAL_RADIX);
			const userId = req.user?.id;

			if (userId === undefined) {
				res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
					error: "User not authenticated",
				});
				return;
			}

			// Check if user has access to view this meeting's documents
			const canView = await canViewMeetingDocuments(userId, meetingId);
			if (!canView) {
				res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
					error: "Not authorized to view documents for this meeting",
				});
				return;
			}

			const documents = await getDocumentsForMeeting(meetingId);

			res.json({ success: true, data: documents });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				error: `Failed to list documents: ${message}`,
			});
		}
	},
);

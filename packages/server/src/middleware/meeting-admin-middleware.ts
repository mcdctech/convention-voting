/**
 * Meeting Admin middleware for Express routes
 * Verifies user is either a global admin or a meeting admin for the requested meeting
 */
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { isUserMeetingAdmin } from "../services/meeting-participant-service.js";
import type { Request, Response, NextFunction } from "express";

// Radix for parsing integers
const DECIMAL_RADIX = 10;

/**
 * Create middleware to require meeting admin or global admin privileges
 * Meeting ID is extracted from request params using the specified parameter name
 *
 * @param meetingIdParam - Name of the parameter containing the meeting ID (default: 'meetingId')
 */
export function requireMeetingAdmin(
	meetingIdParam = "meetingId",
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		// Global admins always have access
		if (req.user.isAdmin) {
			next();
			return;
		}

		// Extract meeting ID from params using dynamic key access

		const meetingIdString: string | undefined = req.params[meetingIdParam];
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for missing param
		if (meetingIdString === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: `Meeting ID parameter '${meetingIdParam}' not found`,
			});
			return;
		}

		const meetingId = parseInt(meetingIdString, DECIMAL_RADIX);
		if (Number.isNaN(meetingId)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Invalid meeting ID",
			});
			return;
		}

		// Check if user is a meeting admin for this specific meeting
		const isMeetingAdmin = await isUserMeetingAdmin(req.user.id, meetingId);
		if (!isMeetingAdmin) {
			res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
				success: false,
				error: "Meeting admin privileges required for this meeting",
			});
			return;
		}

		next();
	};
}

/**
 * Create middleware to require meeting admin or global admin privileges
 * Meeting ID is extracted from request params using 'id' parameter
 * Useful for routes like /meetings/:id/...
 */
export function requireMeetingAdminById(): (
	req: Request,
	res: Response,
	next: NextFunction,
) => Promise<void> {
	return requireMeetingAdmin("id");
}

/**
 * Middleware to require either global admin or meeting admin privileges
 * Does not require a specific meeting ID - allows access if user is admin or is a meeting admin for any meeting
 * Must be used after requireAuth middleware
 *
 * This is useful for endpoints that list all meetings a user can administer
 */
export function requireAdminOrMeetingAdmin(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (req.user === undefined) {
		res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
			success: false,
			error: "Authentication required",
		});
		return;
	}

	// Global admins always have access
	if (req.user.isAdmin) {
		next();
		return;
	}

	// Meeting admins have access to the admin section
	if (req.user.isMeetingAdmin) {
		next();
		return;
	}

	// Neither global admin nor meeting admin - deny access
	res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
		success: false,
		error: "Admin or meeting admin privileges required",
	});
}

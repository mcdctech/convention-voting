/**
 * Meeting Admin middleware for Express routes
 * Verifies user is either a global admin or a meeting admin for the requested meeting
 */
import { HTTP_STATUS } from "@pdc/http-status-codes";
import {
	getMeetingIdForChoice,
	getMeetingIdForMotion,
} from "../services/meeting-service.js";
import { isUserMeetingAdmin } from "../services/meeting-participant-service.js";
import type { Request, Response, NextFunction } from "express";

// Radix for parsing integers
const DECIMAL_RADIX = 10;

/**
 * Shared authorization check: global admin passes, otherwise verify the user is
 * a meeting admin for the specific meeting.
 */
async function authorizeForMeeting(
	req: Request,
	res: Response,
	meetingId: number,
): Promise<boolean> {
	if (req.user === undefined) {
		res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
			success: false,
			error: "Authentication required",
		});
		return false;
	}

	if (req.user.isAdmin) {
		return true;
	}

	const isMeetingAdmin = await isUserMeetingAdmin(req.user.id, meetingId);
	if (!isMeetingAdmin) {
		res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
			success: false,
			error: "Meeting admin privileges required for this meeting",
		});
		return false;
	}

	return true;
}

/**
 * Parse an integer route param, responding with 400 on failure.
 * Returns null when the response has already been sent.
 */
function parseRouteIdParam(
	req: Request,
	res: Response,
	paramName: string,
	entityLabel: string,
): number | null {
	const raw: string | undefined = req.params[paramName];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for missing param
	if (raw === undefined) {
		res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
			success: false,
			error: `${entityLabel} ID parameter '${paramName}' not found`,
		});
		return null;
	}
	const parsed = parseInt(raw, DECIMAL_RADIX);
	if (Number.isNaN(parsed)) {
		res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
			success: false,
			error: `Invalid ${entityLabel.toLowerCase()} ID`,
		});
		return null;
	}
	return parsed;
}

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
		const meetingId = parseRouteIdParam(req, res, meetingIdParam, "Meeting");
		if (meetingId === null) {
			return;
		}

		const authorized = await authorizeForMeeting(req, res, meetingId);
		if (authorized) {
			next();
		}
	};
}

/**
 * Create middleware that authorizes global admins or meeting admins for the
 * meeting that owns the motion identified by the given route param.
 */
export function requireMeetingAdminForMotion(
	motionIdParam = "id",
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const motionId = parseRouteIdParam(req, res, motionIdParam, "Motion");
		if (motionId === null) {
			return;
		}

		// Global admins short-circuit without needing the lookup.
		if (req.user?.isAdmin === true) {
			next();
			return;
		}

		const meetingId = await getMeetingIdForMotion(motionId);
		if (meetingId === null) {
			res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
				success: false,
				error: "Motion not found",
			});
			return;
		}

		const authorized = await authorizeForMeeting(req, res, meetingId);
		if (authorized) {
			next();
		}
	};
}

/**
 * Create middleware that authorizes global admins or meeting admins for the
 * meeting that owns the choice identified by the given route param.
 */
export function requireMeetingAdminForChoice(
	choiceIdParam = "id",
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const choiceId = parseRouteIdParam(req, res, choiceIdParam, "Choice");
		if (choiceId === null) {
			return;
		}

		if (req.user?.isAdmin === true) {
			next();
			return;
		}

		const meetingId = await getMeetingIdForChoice(choiceId);
		if (meetingId === null) {
			res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
				success: false,
				error: "Choice not found",
			});
			return;
		}

		const authorized = await authorizeForMeeting(req, res, meetingId);
		if (authorized) {
			next();
		}
	};
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

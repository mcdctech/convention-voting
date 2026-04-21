/**
 * Watcher meeting-scoped authorization middleware
 *
 * Verifies the authenticated user is authorized to watch a specific meeting
 * (or the meeting that owns a specific motion). Global admins bypass the
 * watcher-pool check. Must be used after requireAuth and requireWatcher.
 */
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { getMeetingIdForMotion } from "../services/meeting-service.js";
import { isUserAuthorizedForMeetingAsWatcher } from "../services/watcher-service.js";
import type { Request, Response, NextFunction } from "express";

const DECIMAL_RADIX = 10;

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

async function authorizeWatcherForMeeting(
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

	const authorized = await isUserAuthorizedForMeetingAsWatcher(
		req.user.id,
		meetingId,
	);
	if (!authorized) {
		res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
			success: false,
			error: "Not authorized to watch this meeting",
		});
		return false;
	}

	return true;
}

/**
 * Require the current user to be a watcher for the meeting identified by the
 * given route param. Global admins bypass the watcher-pool check.
 */
export function requireWatcherForMeeting(
	meetingIdParam = "id",
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
		if (await authorizeWatcherForMeeting(req, res, meetingId)) {
			next();
		}
	};
}

/**
 * Require the current user to be a watcher for the meeting that owns the
 * motion identified by the given route param.
 */
export function requireWatcherForMotion(
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
		if (await authorizeWatcherForMeeting(req, res, meetingId)) {
			next();
		}
	};
}

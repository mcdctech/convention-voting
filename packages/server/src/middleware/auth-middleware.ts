/**
 * Authentication middleware for Express routes
 */
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { verifyToken, getAuthUserById } from "../services/auth-service.js";
import type { Request, Response, NextFunction } from "express";

// Auth header constants
const AUTH_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";
const BEARER_PREFIX_LENGTH = 7;

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
	if (authHeader === undefined) {
		return null;
	}
	if (!authHeader.startsWith(BEARER_PREFIX)) {
		return null;
	}
	return authHeader.slice(BEARER_PREFIX_LENGTH);
}

/**
 * Middleware to require authentication
 * Extracts Bearer token, verifies JWT, and attaches user to request
 */
export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	const authHeader = req.header(AUTH_HEADER);
	const token = extractBearerToken(authHeader);

	if (token === null) {
		res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
			success: false,
			error: "Authentication required",
		});
		return;
	}

	// Verify token
	const payload = verifyToken(token);
	if (payload === null) {
		res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
			success: false,
			error: "Invalid or expired token",
		});
		return;
	}

	// Verify user still exists and is not disabled
	const user = await getAuthUserById(payload.sub);
	if (user === null) {
		res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
			success: false,
			error: "User account not found or disabled",
		});
		return;
	}

	// Attach user to request (standard Express middleware pattern)
	// eslint-disable-next-line no-param-reassign -- Express middleware extends req object by convention
	req.user = user;
	next();
}

/**
 * Middleware to require admin privileges
 * Must be used after requireAuth middleware
 */
export function requireAdmin(
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

	if (!req.user.isAdmin) {
		res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
			success: false,
			error: "Admin privileges required",
		});
		return;
	}

	next();
}

/**
 * Middleware to require watcher privileges
 * Must be used after requireAuth middleware
 */
export function requireWatcher(
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

	if (!req.user.isWatcher) {
		res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
			success: false,
			error: "Watcher privileges required",
		});
		return;
	}

	next();
}

/**
 * Middleware to require voter privileges (NOT admin, NOT watcher)
 * Used to protect voting endpoints from non-voters
 * Must be used after requireAuth middleware
 */
export function requireVoter(
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

	// Watchers and admins cannot vote
	if (req.user.isWatcher || req.user.isAdmin) {
		res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
			success: false,
			error: "Voting privileges required",
		});
		return;
	}

	next();
}

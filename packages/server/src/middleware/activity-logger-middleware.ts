/**
 * Activity logging middleware for quorum tracking
 *
 * Logs authenticated user activity asynchronously (fire-and-forget)
 * to avoid impacting request latency.
 */
import { logActivity } from "../services/activity-service.js";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that logs user activity for quorum tracking
 *
 * Must be applied AFTER requireAuth middleware.
 * Logs are fire-and-forget to avoid impacting request latency.
 */
export function activityLogger(
	req: Request,
	_res: Response,
	next: NextFunction,
): void {
	// Only log if user is authenticated
	if (req.user !== undefined) {
		// Fire and forget - don't wait for logging to complete
		// Extract path without query string
		const { path: urlPath } = req;
		logActivity(req.user.id, urlPath).catch(() => {
			// Silently ignore logging failures to not affect requests
		});
	}
	next();
}

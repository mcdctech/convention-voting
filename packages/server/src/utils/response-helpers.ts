/**
 * Standard API Response Helper Functions
 *
 * These helpers ensure consistent response formats across all API endpoints.
 * All endpoints should use these functions instead of calling res.json() directly.
 */

import { HTTP_STATUS } from "@pdc/http-status-codes";
import type { Response } from "express";
import type { PaginationInfo } from "@mcdc-convention-voting/shared";

// Default status code constants to avoid type inference issues
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

/**
 * Send a successful response with data
 * Format: { success: true, data: T }
 */
export function sendSuccess(
	res: Response,
	data: unknown,
	status = HTTP_OK,
): void {
	res.status(status).json({ success: true, data });
}

/**
 * Send a successful response with data and a message
 * Format: { success: true, data: T, message: string }
 */
export function sendSuccessWithMessage(
	res: Response,
	data: unknown,
	message: string,
	status = HTTP_OK,
): void {
	res.status(status).json({ success: true, data, message });
}

/**
 * Send a successful response with only a message (no data)
 * Format: { success: true, message: string }
 * Use for operations like DELETE where there's no data to return
 */
export function sendSuccessMessage(
	res: Response,
	message: string,
	status = HTTP_OK,
): void {
	res.status(status).json({ success: true, message });
}

/**
 * Send a paginated response
 * Format: { success: true, data: T[], pagination: { page, limit, total, totalPages } }
 */
export function sendPaginated(
	res: Response,
	data: unknown[],
	pagination: PaginationInfo,
): void {
	res
		.status(HTTP_STATUS.SUCCESSFUL.OK)
		.json({ success: true, data, pagination });
}

/**
 * Send an error response
 * Format: { success: false, error: string }
 */
export function sendError(
	res: Response,
	error: string,
	status = HTTP_BAD_REQUEST,
): void {
	res.status(status).json({ success: false, error });
}

/**
 * Send a 404 Not Found error
 */
export function sendNotFound(res: Response, resource = "Resource"): void {
	sendError(res, `${resource} not found`, HTTP_STATUS.CLIENT_ERROR.NOT_FOUND);
}

/**
 * Send a 401 Unauthorized error
 */
export function sendUnauthorized(
	res: Response,
	message = "Authentication required",
): void {
	sendError(res, message, HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED);
}

/**
 * Send a 403 Forbidden error
 */
export function sendForbidden(res: Response, message = "Access denied"): void {
	sendError(res, message, HTTP_STATUS.CLIENT_ERROR.FORBIDDEN);
}

/**
 * Send a 409 Conflict error
 */
export function sendConflict(res: Response, message: string): void {
	sendError(res, message, HTTP_STATUS.CLIENT_ERROR.CONFLICT);
}

/**
 * Send a 500 Internal Server Error
 */
export function sendServerError(
	res: Response,
	message = "Internal server error",
): void {
	sendError(res, message, HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR);
}

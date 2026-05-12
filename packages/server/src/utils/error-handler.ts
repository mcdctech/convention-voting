/**
 * Error Handler Utilities
 *
 * Provides structured error handling with HTTP status code mapping.
 * This is the single source of truth for error code to status code mapping.
 */
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { ServiceErrorCode } from "@mcdc-convention-voting/shared";
import { ServiceError } from "../errors/service-error.js";
import type { Response } from "express";

/** HTTP 500 status code constant */
const HTTP_INTERNAL_SERVER_ERROR = 500;

/**
 * Maps ServiceErrorCode to HTTP status codes.
 * This is the single source of truth for error-to-status mapping.
 *
 * Mapping logic:
 * - Authentication/Authorization → 401/403
 * - Not found errors → 404
 * - Conflict/state errors → 409
 * - Validation errors → 400
 * - Internal errors → 500
 */
const ERROR_CODE_TO_HTTP_STATUS: Record<ServiceErrorCode, number> = {
	// Authentication & Authorization
	[ServiceErrorCode.UNAUTHORIZED]: HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED,
	[ServiceErrorCode.FORBIDDEN]: HTTP_STATUS.CLIENT_ERROR.FORBIDDEN,

	// Resource not found
	[ServiceErrorCode.NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.MOTION_NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.MEETING_NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.USER_NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.POOL_NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.CHOICE_NOT_FOUND]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,

	// Conflict/state errors
	[ServiceErrorCode.ALREADY_VOTED]: HTTP_STATUS.CLIENT_ERROR.CONFLICT,
	[ServiceErrorCode.VOTING_CLOSED]: HTTP_STATUS.CLIENT_ERROR.CONFLICT,
	[ServiceErrorCode.MEETING_NOT_ACTIVE]: HTTP_STATUS.CLIENT_ERROR.NOT_FOUND,
	[ServiceErrorCode.ALREADY_IN_MEETING]: HTTP_STATUS.CLIENT_ERROR.CONFLICT,
	[ServiceErrorCode.NOT_IN_MEETING]: HTTP_STATUS.CLIENT_ERROR.CONFLICT,

	// Eligibility (treated as forbidden)
	[ServiceErrorCode.NOT_ELIGIBLE_FOR_MOTION]:
		HTTP_STATUS.CLIENT_ERROR.FORBIDDEN,
	[ServiceErrorCode.NOT_ELIGIBLE_FOR_MEETING]:
		HTTP_STATUS.CLIENT_ERROR.FORBIDDEN,

	// Validation errors
	[ServiceErrorCode.INVALID_CHOICE]: HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST,
	[ServiceErrorCode.INVALID_SELECTION_COUNT]:
		HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST,
	[ServiceErrorCode.INVALID_INPUT]: HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST,

	// Generic
	[ServiceErrorCode.INTERNAL_ERROR]: HTTP_INTERNAL_SERVER_ERROR,
};

/**
 * Get HTTP status code for a ServiceErrorCode.
 *
 * @param code - The service error code
 * @returns The corresponding HTTP status code
 */
export function getHttpStatusForErrorCode(code: ServiceErrorCode): number {
	return ERROR_CODE_TO_HTTP_STATUS[code];
}

/**
 * Send an error response, using ServiceError code if available.
 * Falls back to 500 Internal Server Error for non-ServiceError errors.
 *
 * @param res - Express response object
 * @param error - The error to handle (ServiceError or any Error)
 * @param fallbackMessage - Message to use if error is not an Error instance
 */
export function sendServiceError(
	res: Response,
	error: unknown,
	fallbackMessage = "An error occurred",
): void {
	if (error instanceof ServiceError) {
		const status = getHttpStatusForErrorCode(error.code);
		res.status(status).json({
			success: false,
			error: error.message,
		});
		return;
	}

	// For non-ServiceError errors, use 500 status and error message
	const message = error instanceof Error ? error.message : fallbackMessage;
	res.status(HTTP_INTERNAL_SERVER_ERROR).json({
		success: false,
		error: message,
	});
}

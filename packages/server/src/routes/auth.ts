/**
 * Authentication routes
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { LoginErrorCode } from "@mcdc-convention-voting/shared";
import { validateLogin, generateToken } from "../services/auth-service.js";
import { requireAuth } from "../middleware/auth-middleware.js";
import { leaveCurrentMeeting } from "../services/meeting-participant-service.js";
import {
	checkRateLimit,
	recordFailedLogin,
	recordSuccessfulLogin,
	type RateLimitCheckResult,
} from "../services/login-rate-limiter.js";
import type { Request, Response } from "express";
import type {
	ApiErrorResponse,
	ApiSuccessResponse,
	AuthUser,
	LoginRequest,
	LoginResponse,
} from "@mcdc-convention-voting/shared";

export const authRouter = Router();

// Time conversion constants
const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_RETRY_MS = 0;

/**
 * Get HTTP status code for login error
 */
function getLoginErrorStatus(errorCode: LoginErrorCode): number {
	switch (errorCode) {
		case LoginErrorCode.InvalidCredentials:
		case LoginErrorCode.NoPasswordSet:
			return HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED;
		case LoginErrorCode.AccountDisabled:
		case LoginErrorCode.LoginDisabled:
			return HTTP_STATUS.CLIENT_ERROR.FORBIDDEN;
		case LoginErrorCode.RateLimited:
			return HTTP_STATUS.CLIENT_ERROR.TOO_MANY_REQUESTS;
	}
}

/**
 * Get user-friendly error message for login error
 */
function getLoginErrorMessage(errorCode: LoginErrorCode): string {
	switch (errorCode) {
		case LoginErrorCode.InvalidCredentials:
			return "Invalid username or password.";
		case LoginErrorCode.NoPasswordSet:
			return "Your password has not been set. Please contact an administrator.";
		case LoginErrorCode.AccountDisabled:
			return "Your account has been disabled.";
		case LoginErrorCode.LoginDisabled:
			return "Login is currently disabled.";
		case LoginErrorCode.RateLimited:
			return "Too many login attempts. Please try again later.";
	}
}

/**
 * Send a rate limit error response with Retry-After header
 */
function sendRateLimitResponse(
	res: Response<ApiErrorResponse>,
	rateLimitResult: RateLimitCheckResult,
): void {
	const retryAfterSeconds = Math.ceil(
		(rateLimitResult.retryAfterMs ?? DEFAULT_RETRY_MS) /
			MILLISECONDS_PER_SECOND,
	);
	res.setHeader("Retry-After", String(retryAfterSeconds));
	res.status(getLoginErrorStatus(LoginErrorCode.RateLimited)).json({
		success: false,
		error: getLoginErrorMessage(LoginErrorCode.RateLimited),
	});
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
authRouter.post(
	"/login",
	async (
		req: Request<
			object,
			ApiSuccessResponse<LoginResponse> | ApiErrorResponse,
			Partial<LoginRequest>
		>,
		res: Response<ApiSuccessResponse<LoginResponse> | ApiErrorResponse>,
	): Promise<void> => {
		const {
			body: { username, password },
		} = req;

		// Validate required fields
		if (
			username === undefined ||
			username === "" ||
			password === undefined ||
			password === ""
		) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Username and password are required",
			});
			return;
		}

		// Check rate limit BEFORE validating credentials (prevents timing attacks)
		const rateLimitResult = checkRateLimit(username);
		if (rateLimitResult.isLocked) {
			sendRateLimitResponse(res, rateLimitResult);
			return;
		}

		// Validate login
		const result = await validateLogin(username, password);

		if (!result.success || result.user === undefined) {
			// Record failed login attempt for rate limiting
			const failureResult = recordFailedLogin(username);

			// Check if this failure triggered a lockout
			if (failureResult.isLocked) {
				sendRateLimitResponse(res, failureResult);
				return;
			}

			const errorCode = result.errorCode ?? LoginErrorCode.InvalidCredentials;
			res.status(getLoginErrorStatus(errorCode)).json({
				success: false,
				error: getLoginErrorMessage(errorCode),
			});
			return;
		}

		// Successful login - clear rate limit state for this username
		recordSuccessfulLogin(username);

		// Leave any current meeting from a previous session
		// This ensures users start fresh and can select a new meeting
		await leaveCurrentMeeting(result.user.id);

		// Generate JWT token
		const token = generateToken(result.user);

		res.json({
			success: true,
			data: {
				token,
				user: result.user,
			},
		});
	},
);

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
authRouter.get(
	"/me",
	requireAuth,
	(
		req: Request<object, ApiSuccessResponse<AuthUser> | ApiErrorResponse>,
		res: Response<ApiSuccessResponse<AuthUser> | ApiErrorResponse>,
	): void => {
		// User is guaranteed to exist because requireAuth middleware verified it
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		res.json({
			success: true,
			data: req.user,
		});
	},
);

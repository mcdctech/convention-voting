/**
 * Authentication routes
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { LoginErrorCode } from "@mcdc-convention-voting/shared";
import { validateLogin, generateToken } from "../services/auth-service.js";
import { requireAuth } from "../middleware/auth-middleware.js";
import type { Request, Response } from "express";
import type {
	LoginRequest,
	LoginResponse,
	ApiResponse,
	AuthUser,
} from "@mcdc-convention-voting/shared";

export const authRouter = Router();

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
	}
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
authRouter.post(
	"/login",
	async (
		req: Request<object, ApiResponse<LoginResponse>, Partial<LoginRequest>>,
		res: Response<ApiResponse<LoginResponse>>,
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

		// Validate login
		const result = await validateLogin(username, password);

		if (!result.success || result.user === undefined) {
			const errorCode = result.errorCode ?? LoginErrorCode.InvalidCredentials;
			res.status(getLoginErrorStatus(errorCode)).json({
				success: false,
				error: getLoginErrorMessage(errorCode),
			});
			return;
		}

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
		req: Request<object, ApiResponse<AuthUser>>,
		res: Response<ApiResponse<AuthUser>>,
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

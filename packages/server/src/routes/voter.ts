/**
 * Voter API routes for viewing motions and voting
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { getOpenMotionsForUser } from "../services/motion-service.js";
import type { Request, Response } from "express";
import type {
	ApiResponse,
	OpenMotionsResponse,
} from "@mcdc-convention-voting/shared";

export const voterRouter = Router();

/**
 * GET /api/voter/motions/open
 * Get open motions for the current authenticated user
 */
voterRouter.get(
	"/motions/open",
	async (
		req: Request<object, ApiResponse<OpenMotionsResponse>>,
		res: Response<ApiResponse<OpenMotionsResponse>>,
	): Promise<void> => {
		// User is guaranteed to exist because requireAuth middleware is applied at the router level
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const motions = await getOpenMotionsForUser(req.user.id);

			res.json({
				success: true,
				data: {
					data: motions,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get open motions: ${message}`,
			});
		}
	},
);

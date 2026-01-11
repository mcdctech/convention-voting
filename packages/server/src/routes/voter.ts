/**
 * Voter API routes for viewing motions and voting
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { getOpenMotionsForUser } from "../services/motion-service.js";
import { getPoolsForUser } from "../services/pool-service.js";
import { castVote, getMotionForVoting } from "../services/vote-service.js";
import type { Request, Response } from "express";
import type {
	ApiResponse,
	CastVoteRequest,
	CastVoteResponse,
	MotionForVoting,
	OpenMotionsResponse,
	Pool,
} from "@mcdc-convention-voting/shared";

// Number parsing
const DECIMAL_RADIX = 10;

// HTTP status code constant
const HTTP_INTERNAL_SERVER_ERROR = 500;

/**
 * Determine HTTP status code for vote casting errors
 */
function getVoteCastErrorStatus(message: string): number {
	if (
		message.includes("already voted") ||
		message.includes("Voting has ended") ||
		message.includes("not currently open")
	) {
		return HTTP_STATUS.CLIENT_ERROR.CONFLICT;
	}

	if (message.includes("not eligible")) {
		return HTTP_STATUS.CLIENT_ERROR.FORBIDDEN;
	}

	if (
		message.includes("Invalid choice") ||
		message.includes("Cannot select") ||
		message.includes("Must select") ||
		message.includes("only select up to")
	) {
		return HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST;
	}

	if (message.includes("not found")) {
		return HTTP_STATUS.CLIENT_ERROR.NOT_FOUND;
	}

	return HTTP_INTERNAL_SERVER_ERROR;
}

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

/**
 * GET /api/voter/pools
 * Get pools for the current authenticated user
 */
voterRouter.get(
	"/pools",
	async (
		req: Request<object, ApiResponse<Pool[]>>,
		res: Response<ApiResponse<Pool[]>>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const pools = await getPoolsForUser(req.user.id);

			res.json({
				success: true,
				data: pools,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get pools: ${message}`,
			});
		}
	},
);

/**
 * GET /api/voter/motions/:id
 * Get motion details for voting (includes choices and vote status)
 */
voterRouter.get(
	"/motions/:id",
	async (
		req: Request<{ id: string }, ApiResponse<MotionForVoting>>,
		res: Response<ApiResponse<MotionForVoting>>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const motionId = parseInt(req.params.id, DECIMAL_RADIX);
		if (Number.isNaN(motionId)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Invalid motion ID",
			});
			return;
		}

		try {
			const motion = await getMotionForVoting(motionId, req.user.id);

			if (motion === null) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: "Motion not found",
				});
				return;
			}

			res.json({
				success: true,
				data: motion,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get motion: ${message}`,
			});
		}
	},
);

/**
 * POST /api/voter/motions/:id/vote
 * Cast a vote on a motion
 */
voterRouter.post(
	"/motions/:id/vote",
	async (
		req: Request<
			{ id: string },
			ApiResponse<CastVoteResponse>,
			CastVoteRequest
		>,
		res: Response<ApiResponse<CastVoteResponse>>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const motionId = parseInt(req.params.id, DECIMAL_RADIX);
		if (Number.isNaN(motionId)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Invalid motion ID",
			});
			return;
		}

		const choiceIds: unknown = req.body.choiceIds;
		const abstain: unknown = req.body.abstain;

		// Validate request body
		if (!Array.isArray(choiceIds)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "choiceIds must be an array",
			});
			return;
		}

		// Validate all elements are numbers
		const validatedChoiceIds: number[] = [];
		for (const id of choiceIds) {
			if (typeof id !== "number") {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "choiceIds must contain only numbers",
				});
				return;
			}
			validatedChoiceIds.push(id);
		}

		if (typeof abstain !== "boolean") {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "abstain must be a boolean",
			});
			return;
		}

		try {
			const vote = await castVote(req.user.id, motionId, {
				choiceIds: validatedChoiceIds,
				abstain,
			});

			res.status(HTTP_STATUS.SUCCESSFUL.CREATED).json({
				success: true,
				data: { vote },
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			const statusCode = getVoteCastErrorStatus(message);
			const errorMessage =
				statusCode === HTTP_INTERNAL_SERVER_ERROR
					? `Failed to cast vote: ${message}`
					: message;

			res.status(statusCode).json({
				success: false,
				error: errorMessage,
			});
		}
	},
);

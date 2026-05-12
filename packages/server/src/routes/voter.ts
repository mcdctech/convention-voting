/**
 * Voter API routes for viewing motions and voting
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { requireVoter } from "../middleware/auth-middleware.js";
import {
	getCurrentMeetingInfo,
	getJoinableMeetingsForVoter,
	joinMeetingAsVoter,
	leaveCurrentMeeting,
} from "../services/meeting-participant-service.js";
import { getOpenMotionsForUser } from "../services/motion-service.js";
import { getPoolsForUser } from "../services/pool-service.js";
import { castVote, getMotionForVoting } from "../services/vote-service.js";
import { sendServiceError } from "../utils/error-handler.js";
import type { Request, Response } from "express";
import type {
	ApiErrorResponse,
	ApiSuccessResponse,
	CastVoteRequest,
	CastVoteResponse,
	CurrentMeetingResponse,
	JoinableMeetingsResponse,
	JoinMeetingResponse,
	LeaveMeetingResponse,
	MotionForVoting,
	OpenMotionsResponse,
	Pool,
} from "@mcdc-convention-voting/shared";

// Number parsing
const DECIMAL_RADIX = 10;

export const voterRouter = Router();

/**
 * GET /api/voter/motions/open
 * Get open motions for the current authenticated user
 */
voterRouter.get(
	"/motions/open",
	async (
		req: Request<object, OpenMotionsResponse | ApiErrorResponse>,
		res: Response<OpenMotionsResponse | ApiErrorResponse>,
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
				data: motions,
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
		req: Request<object, ApiSuccessResponse<Pool[]> | ApiErrorResponse>,
		res: Response<ApiSuccessResponse<Pool[]> | ApiErrorResponse>,
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
		req: Request<
			{ id: string },
			ApiSuccessResponse<MotionForVoting> | ApiErrorResponse
		>,
		res: Response<ApiSuccessResponse<MotionForVoting> | ApiErrorResponse>,
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
 * Protected by requireVoter to prevent watchers and admins from voting
 */
voterRouter.post(
	"/motions/:id/vote",
	requireVoter,
	async (
		req: Request<
			{ id: string },
			ApiSuccessResponse<CastVoteResponse> | ApiErrorResponse,
			CastVoteRequest
		>,
		res: Response<ApiSuccessResponse<CastVoteResponse> | ApiErrorResponse>,
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
		} catch (error) {
			sendServiceError(res, error, "Failed to cast vote");
		}
	},
);

// ============================================================================
// Meeting Participation Endpoints
// ============================================================================

/**
 * GET /api/voter/meetings/joinable
 * Get list of active meetings the user can join as a voter
 */
voterRouter.get(
	"/meetings/joinable",
	async (
		req: Request<object, JoinableMeetingsResponse | ApiErrorResponse>,
		res: Response<JoinableMeetingsResponse | ApiErrorResponse>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const meetings = await getJoinableMeetingsForVoter(req.user.id);

			res.json({
				success: true,
				data: meetings,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get joinable meetings: ${message}`,
			});
		}
	},
);

/**
 * GET /api/voter/meetings/current
 * Get the user's current active meeting
 */
voterRouter.get(
	"/meetings/current",
	async (
		req: Request<object, CurrentMeetingResponse | ApiErrorResponse>,
		res: Response<CurrentMeetingResponse | ApiErrorResponse>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const currentMeeting = await getCurrentMeetingInfo(req.user.id);

			res.json({
				success: true,
				data: currentMeeting,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get current meeting: ${message}`,
			});
		}
	},
);

/**
 * POST /api/voter/meetings/:id/join
 * Join a meeting as a voter
 * Protected by requireVoter to ensure only voters can join meetings
 */
voterRouter.post(
	"/meetings/:id/join",
	requireVoter,
	async (
		req: Request<{ id: string }, JoinMeetingResponse | ApiErrorResponse>,
		res: Response<JoinMeetingResponse | ApiErrorResponse>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
		if (Number.isNaN(meetingId)) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Invalid meeting ID",
			});
			return;
		}

		try {
			const result = await joinMeetingAsVoter(req.user.id, meetingId);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			sendServiceError(res, error, "Failed to join meeting");
		}
	},
);

/**
 * POST /api/voter/meetings/leave
 * Leave the current meeting
 */
voterRouter.post(
	"/meetings/leave",
	async (
		req: Request<object, LeaveMeetingResponse | ApiErrorResponse>,
		res: Response<LeaveMeetingResponse | ApiErrorResponse>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const leftMeeting = await leaveCurrentMeeting(req.user.id);

			res.json({
				success: true,
				data: { left: leftMeeting },
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to leave meeting: ${message}`,
			});
		}
	},
);

/**
 * Watcher API routes for read-only reports
 *
 * All routes are protected by requireAuth + requireWatcher middleware.
 * Watchers have read-only access to:
 * - Meeting reports with motion summaries
 * - Quorum reports (no ability to call quorum)
 * - Motion voter lists (who voted, not what they voted for)
 * - Motion results (for completed votes only)
 */
import { Router } from "express";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import {
	getWatcherMeetings,
	getWatcherMeetingReport,
	getWatcherQuorumReport,
	getWatcherQuorumVoters,
	getWatcherMotionDetail,
	getWatcherMotionVoters,
	getWatcherMotionResult,
} from "../services/watcher-service.js";
import {
	getCurrentMeetingInfo,
	getJoinableMeetingsForWatcher,
	joinMeetingAsWatcher,
	leaveCurrentMeeting,
} from "../services/meeting-participant-service.js";
import type { Request, Response } from "express";
import type {
	ApiResponse,
	CurrentMeetingResponse,
	JoinableMeetingsResponse,
	JoinMeetingResponse,
	LeaveMeetingResponse,
} from "@mcdc-convention-voting/shared";

export const watcherRouter = Router();

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const DECIMAL_RADIX = 10;

// HTTP status code constant
const HTTP_INTERNAL_SERVER_ERROR = 500;

/**
 * Determine HTTP status code for meeting join errors
 */
function getMeetingJoinErrorStatus(message: string): number {
	if (
		message.includes("not found") ||
		message.includes("not currently active") ||
		message.includes("does not allow watchers")
	) {
		return HTTP_STATUS.CLIENT_ERROR.NOT_FOUND;
	}

	if (message.includes("not eligible")) {
		return HTTP_STATUS.CLIENT_ERROR.FORBIDDEN;
	}

	return HTTP_INTERNAL_SERVER_ERROR;
}

// ============================================================================
// Meeting Participation Endpoints
// ============================================================================

/**
 * GET /watcher/meetings/joinable
 * Get list of active meetings the user can join as a watcher
 */
watcherRouter.get(
	"/meetings/joinable",
	async (
		req: Request<object, ApiResponse<JoinableMeetingsResponse>>,
		res: Response<ApiResponse<JoinableMeetingsResponse>>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const meetings = await getJoinableMeetingsForWatcher(req.user.id);

			res.json({
				success: true,
				data: {
					data: meetings,
				},
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
 * GET /watcher/meetings/current
 * Get the user's current active meeting
 */
watcherRouter.get(
	"/meetings/current",
	async (
		req: Request<object, ApiResponse<CurrentMeetingResponse>>,
		res: Response<ApiResponse<CurrentMeetingResponse>>,
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
				data: {
					data: currentMeeting,
				},
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
 * POST /watcher/meetings/:id/join
 * Join a meeting as a watcher
 */
watcherRouter.post(
	"/meetings/:id/join",
	async (
		req: Request<{ id: string }, ApiResponse<JoinMeetingResponse>>,
		res: Response<ApiResponse<JoinMeetingResponse>>,
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
			const result = await joinMeetingAsWatcher(req.user.id, meetingId);

			res.json({
				success: true,
				data: {
					data: result,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			const statusCode = getMeetingJoinErrorStatus(message);

			res.status(statusCode).json({
				success: false,
				error: message,
			});
		}
	},
);

/**
 * POST /watcher/meetings/leave
 * Leave the current meeting
 */
watcherRouter.post(
	"/meetings/leave",
	async (
		req: Request<object, ApiResponse<LeaveMeetingResponse>>,
		res: Response<ApiResponse<LeaveMeetingResponse>>,
	): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const success = await leaveCurrentMeeting(req.user.id);

			res.json({
				success: true,
				data: {
					data: { success },
				},
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

// ============================================================================
// Meeting Endpoints
// ============================================================================

/**
 * GET /watcher/meetings
 * Get meetings with motion summaries (filtered by watcher pool membership)
 */
watcherRouter.get(
	"/meetings",
	async (req: Request, res: Response): Promise<void> => {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		try {
			const page = parseInt(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Query param is string
				(req.query.page as string | undefined) ?? String(DEFAULT_PAGE),
				DECIMAL_RADIX,
			);
			const limit = parseInt(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Query param is string
				(req.query.limit as string | undefined) ?? String(DEFAULT_LIMIT),
				DECIMAL_RADIX,
			);

			const { meetings, total } = await getWatcherMeetings(
				req.user.id,
				page,
				limit,
			);

			res.json({
				data: meetings,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			});
		} catch (error) {
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to get meetings",
			});
		}
	},
);

/**
 * GET /watcher/meetings/:id
 * Get detailed meeting report with all motions
 */
watcherRouter.get(
	"/meetings/:id",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(meetingId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid meeting ID",
				});
				return;
			}

			const report = await getWatcherMeetingReport(meetingId);

			if (report === null) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: "Meeting not found",
				});
				return;
			}

			res.json({
				success: true,
				data: report,
			});
		} catch (error) {
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to get meeting report",
			});
		}
	},
);

// ============================================================================
// Quorum Endpoints
// ============================================================================

/**
 * GET /watcher/meetings/:id/quorum
 * Get quorum report (read-only)
 */
watcherRouter.get(
	"/meetings/:id/quorum",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(meetingId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid meeting ID",
				});
				return;
			}

			const report = await getWatcherQuorumReport(meetingId);

			if (report === null) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: "Meeting not found",
				});
				return;
			}

			res.json({
				success: true,
				data: report,
			});
		} catch (error) {
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to get quorum report",
			});
		}
	},
);

/**
 * GET /watcher/meetings/:id/quorum/voters
 * Get list of present members for quorum
 */
watcherRouter.get(
	"/meetings/:id/quorum/voters",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(meetingId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid meeting ID",
				});
				return;
			}

			const voters = await getWatcherQuorumVoters(meetingId);

			res.json({
				success: true,
				data: voters,
			});
		} catch (error) {
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to get quorum voters",
			});
		}
	},
);

// ============================================================================
// Motion Endpoints
// ============================================================================

/**
 * GET /watcher/motions/:id
 * Get detailed motion information for motion report page
 */
watcherRouter.get(
	"/motions/:id",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(motionId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid motion ID",
				});
				return;
			}

			const detail = await getWatcherMotionDetail(motionId);

			if (detail === null) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: "Motion not found",
				});
				return;
			}

			res.json({
				success: true,
				data: detail,
			});
		} catch (error) {
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to get motion detail",
			});
		}
	},
);

/**
 * GET /watcher/motions/:id/voters
 * Get list of who voted on a completed motion (NOT what they voted for)
 */
watcherRouter.get(
	"/motions/:id/voters",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(motionId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid motion ID",
				});
				return;
			}

			const voters = await getWatcherMotionVoters(motionId);

			res.json({
				success: true,
				data: voters,
			});
		} catch (error) {
			// Check for specific error messages to return appropriate status codes
			const errorMessage =
				error instanceof Error ? error.message : "Failed to get motion voters";

			if (errorMessage.includes("not found")) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: errorMessage,
				});
				return;
			}

			if (errorMessage.includes("only available for completed")) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: errorMessage,
				});
				return;
			}

			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: errorMessage,
			});
		}
	},
);

/**
 * GET /watcher/motions/:id/results
 * Get final tally for completed motion
 */
watcherRouter.get(
	"/motions/:id/results",
	async (req: Request, res: Response): Promise<void> => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);

			if (isNaN(motionId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid motion ID",
				});
				return;
			}

			const result = await getWatcherMotionResult(motionId);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			// Check for specific error messages to return appropriate status codes
			const errorMessage =
				error instanceof Error ? error.message : "Failed to get motion results";

			if (errorMessage.includes("not found")) {
				res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({
					success: false,
					error: errorMessage,
				});
				return;
			}

			if (errorMessage.includes("only available for completed")) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: errorMessage,
				});
				return;
			}

			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: errorMessage,
			});
		}
	},
);

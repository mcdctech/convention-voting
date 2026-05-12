/**
 * Admin API routes for user, pool, meeting, motion, and choice management
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import {
	ParticipantRole,
	PoolType,
	type CreateUserRequest,
	type UpdateUserRequest,
	type UserListResponse,
	type BulkPasswordResponse,
	type PasswordResetResponse,
	type GeneratePasswordsRequest,
	type PasswordGenerationProgress,
	type CreatePoolRequest,
	type UpdatePoolRequest,
	type PoolListResponse,
	type PendingPoolKeyListResponse,
	type ResolvePendingPoolCreateRequest,
	type ResolvePendingPoolRemapRequest,
	type CreateMeetingRequest,
	type UpdateMeetingRequest,
	type MeetingListResponse,
	type CreateMotionRequest,
	type UpdateMotionRequest,
	type UpdateMotionStatusRequest,
	type MotionListResponse,
	type CreateChoiceRequest,
	type UpdateChoiceRequest,
	type ReorderChoicesRequest,
	type ChoiceListResponse,
	type CSVValidationResult,
} from "@mcdc-convention-voting/shared";
import {
	createUser,
	getUserById,
	listUsers,
	listUsersByDateRange,
	updateUser,
	disableUser,
	enableUser,
	deleteUser,
	bulkDeleteUsers,
	generatePasswordsForUsers,
	resetUserPassword,
	getSystemSettings,
	setNonAdminLoginEnabled,
} from "../services/user-service.js";
import {
	createPool,
	getPoolById,
	listPools,
	updatePool,
	disablePool,
	enablePool,
	getUsersInPool,
	addUserToPool,
	removeUserFromPool,
	getPoolsForUser,
	type ListPoolsOptions,
} from "../services/pool-service.js";
import {
	createMeeting,
	getMeetingById,
	listMeetings,
	listMeetingsForMeetingAdmin,
	updateMeeting,
	deleteMeeting,
	getVoterPoolsForMeeting,
	setVoterPoolsForMeeting,
	createMotion,
	getMotionById,
	getMotionDetailedResults,
	getMotionVoteStats,
	listMotionsForMeeting,
	updateMotion,
	updateMotionStatus,
	setMotionEndOverride,
	deleteMotion,
	createChoice,
	getChoiceById,
	listChoicesForMotion,
	updateChoice,
	reorderChoices,
	deleteChoice,
} from "../services/meeting-service.js";
import {
	importUsersFromCSV,
	importPoolsFromCSV,
	validateUsersCSV,
} from "../services/csv-service.js";
import {
	getQuorumReport,
	callQuorum,
	getActiveVotersForQuorum,
} from "../services/quorum-service.js";
import {
	listPendingPoolKeys,
	resolvePendingByCreatingPool,
	resolvePendingByRemapping,
	deletePendingPoolKey,
} from "../services/pending-pool-service.js";
import {
	getJoinableMeetingsForAdmin,
	getAllMeetingsForAdmin,
	joinMeetingAsAdmin,
	leaveCurrentMeeting,
	getCurrentMeetingInfo,
} from "../services/meeting-participant-service.js";
import {
	// canMeetingAdminAccessPool, // TODO: will be used when updating pool routes
	canMeetingAdminAccessUser,
} from "../services/auth-service.js";
import { requireAdmin } from "../middleware/auth-middleware.js";
import {
	requireAdminOrMeetingAdmin,
	requireMeetingAdmin,
	requireMeetingAdminForChoice,
	requireMeetingAdminForMotion,
} from "../middleware/meeting-admin-middleware.js";
import { sendServiceError } from "../utils/error-handler.js";

export const adminRouter = Router();

/**
 * Check if a value is missing, null, or empty string (after trimming)
 * Used for runtime validation of required string fields from request body
 */
function isEmptyString(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim() === "")
	);
}

// Pagination defaults
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

// Pool key validation: letters (case-sensitive), numbers, hyphens, underscores, spaces
const POOL_KEY_PATTERN = /^[A-Za-z0-9_\- ]+$/;
const MAX_POOL_KEY_LENGTH = 255;

/**
 * Validate pool key format
 * @returns error message if invalid, undefined if valid
 */
function validatePoolKeyFormat(poolKey: string): string | undefined {
	if (poolKey.length > MAX_POOL_KEY_LENGTH) {
		return `poolKey exceeds maximum length of ${MAX_POOL_KEY_LENGTH} characters`;
	}
	if (!POOL_KEY_PATTERN.test(poolKey)) {
		return "poolKey contains invalid characters. Only letters, numbers, hyphens, underscores, and spaces allowed.";
	}
	return undefined;
}

/**
 * Parse poolType query parameter
 * @returns PoolType value, "null" for null filter, or undefined if not specified
 */
function parsePoolTypeParam(param: unknown): PoolType | "null" | undefined {
	if (typeof param !== "string") {
		return undefined;
	}
	// Compare against string values to avoid unsafe enum comparison
	switch (param) {
		case "null":
			return "null";
		case "voter":
			return PoolType.Voter;
		case "watcher":
			return PoolType.Watcher;
		case "meeting_admin":
			return PoolType.MeetingAdmin;
		default:
			return undefined;
	}
}

const DECIMAL_RADIX = 10;

/**
 * Parse date range parameters from query string
 * @returns Date objects if valid, error message if invalid
 */
function parseDateRangeParams(query: Record<string, unknown>):
	| {
			success: true;
			start: Date;
			end: Date;
	  }
	| { success: false; error: string } {
	const startDateParam =
		typeof query.startDate === "string" ? query.startDate : undefined;
	const endDateParam =
		typeof query.endDate === "string" ? query.endDate : undefined;

	if (startDateParam === undefined || endDateParam === undefined) {
		return { success: false, error: "startDate and endDate are required" };
	}

	const start = new Date(startDateParam);
	const end = new Date(endDateParam);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return { success: false, error: "Invalid date format. Use ISO format." };
	}

	return { success: true, start, end };
}

// File upload limits
const BYTES_PER_KB = 1024;
const KB_PER_MB = 1024;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * KB_PER_MB * BYTES_PER_KB;

// Configure multer for file uploads
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: MAX_FILE_SIZE_BYTES,
	},
});

/**
 * POST /api/admin/users/validate-csv
 * Validate CSV file without importing (preflight validation)
 */
adminRouter.post(
	"/users/validate-csv",
	requireAdmin,
	upload.single("file"),
	async (req: Request, res: Response) => {
		try {
			if (req.file === undefined) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: "No file uploaded" });
				return;
			}

			const result: CSVValidationResult = await validateUsersCSV(
				req.file.buffer,
			);

			res.json({
				success: true,
				data: result,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to validate CSV: ${message}` });
		}
	},
);

/**
 * POST /api/admin/users/upload
 * Upload CSV file to bulk create users
 */
adminRouter.post(
	"/users/upload",
	requireAdmin,
	upload.single("file"),
	async (req: Request, res: Response) => {
		try {
			if (req.file === undefined) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: "No file uploaded" });
				return;
			}

			const result = await importUsersFromCSV(req.file.buffer);

			res.json({
				success: true,
				message: `Imported ${result.success} users successfully`,
				data: result,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to import users: ${message}` });
		}
	},
);

/**
 * GET /api/admin/users
 * List all users with pagination and optional search/pool filter
 * Query params:
 * - page, limit: pagination
 * - search: search term for name, username, or voter ID
 * - poolId: filter by specific pool ID
 * - noPool: if "true", only return users not assigned to any pool
 * - includeDisabled: if "true", include disabled users (default: false)
 * - role: filter by user role ("all", "admin", "meeting_admin", "watcher", "voter")
 * - forMeetingId: filter to users in pools associated with a specific meeting
 */

adminRouter.get(
	"/users",
	requireAdminOrMeetingAdmin,
	// eslint-disable-next-line complexity -- user filtering has many parameters to parse
	async (req: Request, res: Response) => {
		try {
			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const searchParam =
				typeof req.query.search === "string" ? req.query.search : undefined;
			const poolIdParam =
				typeof req.query.poolId === "string" ? req.query.poolId : undefined;
			const poolIdParsed =
				poolIdParam === undefined
					? undefined
					: parseInt(poolIdParam, DECIMAL_RADIX);
			const poolId =
				poolIdParsed === undefined || isNaN(poolIdParsed)
					? undefined
					: poolIdParsed;
			const noPoolParam =
				typeof req.query.noPool === "string" ? req.query.noPool : undefined;
			const noPool = noPoolParam === "true";
			const includeDisabledParam =
				typeof req.query.includeDisabled === "string"
					? req.query.includeDisabled
					: undefined;
			const includeDisabled = includeDisabledParam === "true";
			const roleParam =
				typeof req.query.role === "string" ? req.query.role : undefined;
			type UserRoleFilter =
				| "all"
				| "admin"
				| "meeting_admin"
				| "watcher"
				| "voter";
			const isValidRole = (value: string): value is UserRoleFilter =>
				["all", "admin", "meeting_admin", "watcher", "voter"].includes(value);
			const role =
				roleParam !== undefined && isValidRole(roleParam)
					? roleParam
					: undefined;
			const forMeetingIdParam =
				typeof req.query.forMeetingId === "string"
					? req.query.forMeetingId
					: undefined;
			const forMeetingIdParsed =
				forMeetingIdParam === undefined
					? undefined
					: Number.parseInt(forMeetingIdParam, DECIMAL_RADIX);
			const forMeetingId =
				forMeetingIdParsed === undefined || Number.isNaN(forMeetingIdParsed)
					? undefined
					: forMeetingIdParsed;
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			const { users, total } = await listUsers({
				page,
				limit,
				search: searchParam,
				poolId,
				noPool,
				includeDisabled,
				role,
				forMeetingId,
			});

			const response: UserListResponse = {
				success: true,
				data: users,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ success: false, error: `Failed to list users: ${message}` });
		}
	},
);

/**
 * POST /api/admin/users
 * Create a single user
 */
adminRouter.post(
	"/users",
	requireAdminOrMeetingAdmin,
	 
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const request: CreateUserRequest = req.body;

			// Meeting admins cannot create global admin users
			if (
				req.user?.isAdmin === false &&
				req.user.isMeetingAdmin &&
				request.isAdmin === true
			) {
				res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
					error: "Meeting admins cannot create global admin users",
				});
				return;
			}

			// Validate required fields
			if (
				isEmptyString(request.voterId) ||
				isEmptyString(request.firstName) ||
				isEmptyString(request.lastName)
			) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required fields: voterId, firstName, lastName",
				});
				return;
			}

			// Trim whitespace from validated fields
			const trimmedRequest: CreateUserRequest = {
				...request,
				voterId: request.voterId.trim(),
				firstName: request.firstName.trim(),
				lastName: request.lastName.trim(),
				username: request.username?.trim(),
			};

			const user = await createUser(trimmedRequest);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: user });
		} catch (error) {
			sendServiceError(res, error, "Failed to create user");
		}
	},
);

/**
 * GET /api/admin/users/by-date-range
 * List users created within a date range (for identifying imported users)
 * Query params: startDate, endDate (ISO format), page, limit
 * NOTE: This route MUST come before /users/:id to avoid being caught by the :id param
 */
adminRouter.get(
	"/users/by-date-range",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const dateParams = parseDateRangeParams(req.query);
			if (!dateParams.success) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: dateParams.error });
				return;
			}

			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			const result = await listUsersByDateRange(
				dateParams.start,
				dateParams.end,
				page,
				limit,
			);
			res.json({ success: true, data: result.users, total: result.total });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to list users: ${message}` });
		}
	},
);

/**
 * GET /api/admin/users/generate-passwords-stream
 * Generate passwords with real-time progress via Server-Sent Events (SSE)
 * Query params: ?poolId=123&noPool=true&onlyNullPasswords=true
 * NOTE: This route MUST come before /users/:id to avoid being caught by the :id param
 */
adminRouter.get(
	"/users/generate-passwords-stream",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// Set SSE headers
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			// Parse query parameters
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Need intermediate variables for type checking
			const poolIdParam = req.query.poolId;
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Need intermediate variables for type checking
			const noPoolParam = req.query.noPool;
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Need intermediate variables for type checking
			const onlyNullPasswordsParam = req.query.onlyNullPasswords;

			const poolId =
				typeof poolIdParam === "string"
					? Number.parseInt(poolIdParam, DECIMAL_RADIX)
					: undefined;
			const noPool =
				typeof noPoolParam === "string" ? noPoolParam === "true" : undefined;
			const onlyNullPasswords =
				typeof onlyNullPasswordsParam === "string"
					? onlyNullPasswordsParam === "true"
					: undefined;

			// Progress callback that sends SSE events
			const sendProgress = (progress: PasswordGenerationProgress): void => {
				res.write(`data: ${JSON.stringify(progress)}\n\n`);
			};

			// Generate passwords with progress tracking
			const results = await generatePasswordsForUsers(
				{
					poolId,
					noPool,
					onlyNullPasswords,
				},
				sendProgress,
			);

			// Send final results and close stream
			const finalData = {
				phase: "complete" as const,
				results,
				count: results.length,
			};
			res.write(`data: ${JSON.stringify(finalData)}\n\n`);
			res.end();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			const errorData = {
				phase: "error" as const,
				message: `Failed to generate passwords: ${message}`,
			};
			res.write(`data: ${JSON.stringify(errorData)}\n\n`);
			res.end();
		}
	},
);

/**
 * GET /api/admin/users/:id
 * Get a single user by ID
 */
adminRouter.get(
	"/users/:id",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			// Meeting admins must have access to this user
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const canAccess = await canMeetingAdminAccessUser(
					req.user.id,
					req.params.id,
				);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only view users in their authorized meetings",
					});
					return;
				}
			}

			const user = await getUserById(req.params.id);

			if (user === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "User not found" });
				return;
			}

			res.json({ success: true, data: user });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get user: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/users/:id
 * Update user details
 */
adminRouter.put(
	"/users/:id",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			// Meeting admins must have access to this user
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const canAccess = await canMeetingAdminAccessUser(
					req.user.id,
					req.params.id,
				);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only modify users in their authorized meetings",
					});
					return;
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const updates: UpdateUserRequest = req.body;
			const user = await updateUser(req.params.id, updates);
			res.json({ success: true, data: user });
		} catch (error) {
			sendServiceError(res, error, "Failed to update user");
		}
	},
);

/**
 * POST /api/admin/users/:id/disable
 * Disable a user
 */
adminRouter.post(
	"/users/:id/disable",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// Prevent users from disabling themselves
			if (req.params.id === req.user?.id) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Cannot disable your own account",
				});
				return;
			}

			const user = await disableUser(req.params.id);
			res.json({ success: true, data: user });
		} catch (error) {
			sendServiceError(res, error, "Failed to disable user");
		}
	},
);

/**
 * POST /api/admin/users/:id/enable
 * Enable a user
 */
adminRouter.post(
	"/users/:id/enable",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const user = await enableUser(req.params.id);
			res.json({ success: true, data: user });
		} catch (error) {
			sendServiceError(res, error, "Failed to enable user");
		}
	},
);

/**
 * DELETE /api/admin/users/:id
 * Delete a single user (cannot delete admins)
 */
adminRouter.delete(
	"/users/:id",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			await deleteUser(req.params.id);
			res.json({ success: true });
		} catch (error) {
			sendServiceError(res, error, "Failed to delete user");
		}
	},
);

/**
 * POST /api/admin/users/bulk-delete
 * Bulk delete users by IDs (cannot delete admins)
 * Body: { userIds: string[] }
 */
adminRouter.post(
	"/users/bulk-delete",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: { userIds?: string[] } = req.body;

			if (!Array.isArray(body.userIds)) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: "userIds must be an array" });
				return;
			}

			const result = await bulkDeleteUsers(body.userIds);
			res.json({
				success: true,
				data: {
					deleted: result.deleted,
					skipped: result.skipped,
					skippedAdmins: result.skippedAdmins,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to delete users: ${message}` });
		}
	},
);

/**
 * POST /api/admin/users/:id/reset-password
 * Reset a user's password
 */
adminRouter.post(
	"/users/:id/reset-password",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const user = await getUserById(req.params.id);
			if (user === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "User not found" });
				return;
			}

			const password = await resetUserPassword(req.params.id);

			const response: PasswordResetResponse = {
				username: user.username,
				password,
			};

			res.json({ success: true, data: response });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to reset password: ${message}` });
		}
	},
);

/**
 * POST /api/admin/users/generate-passwords
 * Generate passwords for users with optional filtering
 * Body: { poolId?: number, noPool?: boolean, onlyNullPasswords?: boolean }
 */
adminRouter.post(
	"/users/generate-passwords",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// Extract optional filter parameters from request body
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: GeneratePasswordsRequest = req.body;
			const poolId = typeof body.poolId === "number" ? body.poolId : undefined;
			const noPool = typeof body.noPool === "boolean" ? body.noPool : undefined;
			const onlyNullPasswords =
				typeof body.onlyNullPasswords === "boolean"
					? body.onlyNullPasswords
					: undefined;

			const results = await generatePasswordsForUsers({
				poolId,
				noPool,
				onlyNullPasswords,
			});

			const response: BulkPasswordResponse = {
				results,
				count: results.length,
			};

			res.json({ success: true, data: response });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to generate passwords: ${message}` });
		}
	},
);

/**
 * GET /api/admin/settings
 * Get system settings
 */
adminRouter.get(
	"/settings",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const settings = await getSystemSettings();
			res.json({ success: true, data: settings });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get settings: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/settings/login-enabled
 * Toggle site-wide non-admin login
 */
adminRouter.put(
	"/settings/login-enabled",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req.body is any
			const enabled: boolean = req.body.enabled;

			if (typeof enabled !== "boolean") {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: "enabled must be a boolean value" });
				return;
			}

			await setNonAdminLoginEnabled(enabled);
			res.json({
				success: true,
				message: `Non-admin login ${enabled ? "enabled" : "disabled"}`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to update settings: ${message}` });
		}
	},
);

/**
 * Pool Management Routes
 */

/**
 * POST /api/admin/pools/upload
 * Upload CSV file to bulk create pools
 */
adminRouter.post(
	"/pools/upload",
	requireAdmin,
	upload.single("file"),
	async (req: Request, res: Response) => {
		try {
			if (req.file === undefined) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
					.json({ error: "No file uploaded" });
				return;
			}

			const result = await importPoolsFromCSV(req.file.buffer);

			res.json({
				success: true,
				message: `Imported ${result.success} pools successfully`,
				data: result,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to import pools: ${message}` });
		}
	},
);

/**
 * GET /api/admin/pools
 * List all pools with pagination and optional filters
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - includeDisabled: Include disabled pools (default: false)
 * - onlyQuorumPools: Show only quorum pools (default: false)
 * - poolType: Filter by pool type (voter, watcher, meeting_admin, null)
 * - forMeetingId: Filter to pools associated with a specific meeting
 */
adminRouter.get(
	"/pools",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			// Parse filter parameters from query
			const { query } = req;
			const includeDisabled = query.includeDisabled === "true";
			const onlyQuorumPools = query.onlyQuorumPools === "true";
			const poolType = parsePoolTypeParam(query.poolType);
			const forMeetingId =
				typeof query.forMeetingId === "string"
					? Number.parseInt(query.forMeetingId, DECIMAL_RADIX)
					: undefined;

			const options: ListPoolsOptions = {
				page,
				limit,
				includeDisabled,
				onlyQuorumPools,
				poolType,
				forMeetingId,
			};

			const { pools, total } = await listPools(options);

			const response: PoolListResponse = {
				success: true,
				data: pools,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ success: false, error: `Failed to list pools: ${message}` });
		}
	},
);

/**
 * POST /api/admin/pools
 * Create a single pool
 */
adminRouter.post(
	"/pools",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const request: CreatePoolRequest = req.body;

			// Validate required fields
			if (isEmptyString(request.poolKey) || isEmptyString(request.poolName)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required fields: poolKey, poolName",
				});
				return;
			}

			// Trim whitespace from validated fields
			const trimmedRequest: CreatePoolRequest = {
				...request,
				poolKey: request.poolKey.trim(),
				poolName: request.poolName.trim(),
			};

			// Validate pool key format
			const poolKeyError = validatePoolKeyFormat(trimmedRequest.poolKey);
			if (poolKeyError !== undefined) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: poolKeyError,
				});
				return;
			}

			const pool = await createPool(trimmedRequest);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: pool });
		} catch (error) {
			sendServiceError(res, error, "Failed to create pool");
		}
	},
);

/**
 * GET /api/admin/pools/pending
 * List pending (missing) pool keys with user counts
 */
adminRouter.get(
	"/pools/pending",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			const { pendingKeys, total } = await listPendingPoolKeys(page, limit);

			const response: PendingPoolKeyListResponse = {
				success: true,
				data: pendingKeys,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to list pending pool keys: ${message}`,
			});
		}
	},
);

/**
 * POST /api/admin/pools/pending/create
 * Resolve pending pool key by creating a new pool
 */
adminRouter.post(
	"/pools/pending/create",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const request: ResolvePendingPoolCreateRequest = req.body;

			// Validate required fields
			if (isEmptyString(request.poolKey) || isEmptyString(request.poolName)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required fields: poolKey, poolName",
				});
				return;
			}

			// Validate pool key format
			const poolKeyError = validatePoolKeyFormat(request.poolKey.trim());
			if (poolKeyError !== undefined) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: poolKeyError,
				});
				return;
			}

			const result = await resolvePendingByCreatingPool(
				request.poolKey.trim(),
				request.poolName.trim(),
				request.description?.trim(),
			);

			res.status(HTTP_STATUS.SUCCESSFUL.CREATED).json({
				success: true,
				data: result,
				message: `Created pool and associated ${result.usersUpdated} users`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to create pool from pending: ${message}` });
		}
	},
);

/**
 * POST /api/admin/pools/pending/remap
 * Resolve pending pool key by remapping users to existing pool
 */
adminRouter.post(
	"/pools/pending/remap",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const request: ResolvePendingPoolRemapRequest = req.body;

			// Validate required fields
			if (
				isEmptyString(request.pendingPoolKey) ||
				typeof request.targetPoolId !== "number"
			) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required fields: pendingPoolKey, targetPoolId",
				});
				return;
			}

			const result = await resolvePendingByRemapping(
				request.pendingPoolKey.trim(),
				request.targetPoolId,
			);

			res.json({
				success: true,
				data: result,
				message: `Remapped ${result.usersUpdated} users to pool "${result.pool.poolName}"`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to remap pending pool key: ${message}` });
		}
	},
);

/**
 * DELETE /api/admin/pools/pending/:poolKey
 * Delete pending pool key records without resolving
 */
adminRouter.delete(
	"/pools/pending/:poolKey",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Already using destructuring
			const { poolKey } = req.params;
			const deletedCount = await deletePendingPoolKey(poolKey);

			res.json({
				success: true,
				data: { deletedCount },
				message: `Deleted ${deletedCount} pending records for "${poolKey}"`,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to delete pending pool key: ${message}` });
		}
	},
);

/**
 * GET /api/admin/pools/:id
 * Get a single pool by ID
 */
adminRouter.get(
	"/pools/:id",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			const poolId = parseInt(req.params.id, 10);

			// Meeting admins must have access to this pool
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const { canMeetingAdminAccessPool } =
					await import("../services/auth-service.js");
				const canAccess = await canMeetingAdminAccessPool(req.user.id, poolId);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only view pools for their authorized meetings",
					});
					return;
				}
			}

			const pool = await getPoolById(poolId);

			if (pool === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "Pool not found" });
				return;
			}

			res.json({ success: true, data: pool });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get pool: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/pools/:id
 * Update pool details
 */
adminRouter.put(
	"/pools/:id",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const poolId = parseInt(req.params.id, 10);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const updates: UpdatePoolRequest = req.body;

			// Validate pool key format if being updated
			if (updates.poolKey !== undefined) {
				const trimmedPoolKey = updates.poolKey.trim();
				const poolKeyError = validatePoolKeyFormat(trimmedPoolKey);
				if (poolKeyError !== undefined) {
					res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
						error: poolKeyError,
					});
					return;
				}
				updates.poolKey = trimmedPoolKey;
			}

			const { pool, resolvedUsers } = await updatePool(poolId, updates);
			res.json({ success: true, data: pool, resolvedUsers });
		} catch (error) {
			sendServiceError(res, error, "Failed to update pool");
		}
	},
);

/**
 * POST /api/admin/pools/:id/disable
 * Disable a pool
 */
adminRouter.post(
	"/pools/:id/disable",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const poolId = parseInt(req.params.id, 10);
			const pool = await disablePool(poolId);
			res.json({ success: true, data: pool });
		} catch (error) {
			sendServiceError(res, error, "Failed to disable pool");
		}
	},
);

/**
 * POST /api/admin/pools/:id/enable
 * Enable a pool
 */
adminRouter.post(
	"/pools/:id/enable",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const poolId = parseInt(req.params.id, 10);
			const pool = await enablePool(poolId);
			res.json({ success: true, data: pool });
		} catch (error) {
			sendServiceError(res, error, "Failed to enable pool");
		}
	},
);

/**
 * GET /api/admin/pools/:id/users
 * Get users in a pool
 */
adminRouter.get(
	"/pools/:id/users",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			const poolId = parseInt(req.params.id, 10);

			// Meeting admins must have access to this pool
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const { canMeetingAdminAccessPool } =
					await import("../services/auth-service.js");
				const canAccess = await canMeetingAdminAccessPool(req.user.id, poolId);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only view pools for their authorized meetings",
					});
					return;
				}
			}

			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			const { users, total } = await getUsersInPool(poolId, page, limit);

			const response: UserListResponse = {
				success: true,
				data: users,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get pool users: ${message}`,
			});
		}
	},
);

/**
 * POST /api/admin/pools/:id/users/:userId
 * Add user to pool
 */
adminRouter.post(
	"/pools/:id/users/:userId",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			const {
				params: { id, userId },
			} = req;
			const poolId = parseInt(id, 10);

			// Meeting admins must have access to this pool
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const { canMeetingAdminAccessPool } =
					await import("../services/auth-service.js");
				const canAccess = await canMeetingAdminAccessPool(req.user.id, poolId);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only manage pools for their authorized meetings",
					});
					return;
				}
			}

			await addUserToPool(poolId, userId);
			res.json({ success: true, message: "User added to pool successfully" });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to add user to pool: ${message}` });
		}
	},
);

/**
 * DELETE /api/admin/pools/:id/users/:userId
 * Remove user from pool
 */
adminRouter.delete(
	"/pools/:id/users/:userId",
	requireAdminOrMeetingAdmin,
	// eslint-disable-next-line complexity -- Meeting admin authorization and self-removal checks
	async (req: Request, res: Response) => {
		try {
			const {
				params: { id, userId },
			} = req;
			const poolId = parseInt(id, 10);

			// Meeting admins must have access to this pool
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const { canMeetingAdminAccessPool } =
					await import("../services/auth-service.js");
				const canAccess = await canMeetingAdminAccessPool(req.user.id, poolId);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only manage pools for their authorized meetings",
					});
					return;
				}
			}

			// Check if user is removing themselves from their joined meeting's admin pool
			if (userId === req.user?.id) {
				const currentMeeting = await getCurrentMeetingInfo(userId);
				if (
					currentMeeting !== null &&
					currentMeeting.participant.role === ParticipantRole.MeetingAdmin &&
					currentMeeting.meeting.meetingAdminPoolId === poolId
				) {
					res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
						success: false,
						error:
							"Cannot remove yourself from the admin pool of your current meeting",
					});
					return;
				}
			}

			await removeUserFromPool(poolId, userId);
			res.json({
				success: true,
				message: "User removed from pool successfully",
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to remove user from pool: ${message}` });
		}
	},
);

/**
 * GET /api/admin/users/:id/pools
 * Get pools for a user
 */
adminRouter.get(
	"/users/:id/pools",
	requireAdminOrMeetingAdmin,
	async (req: Request, res: Response) => {
		try {
			const {
				params: { id },
			} = req;

			// Meeting admins must have access to this user
			if (req.user?.isAdmin === false && req.user.isMeetingAdmin) {
				const canAccess = await canMeetingAdminAccessUser(req.user.id, id);
				if (!canAccess) {
					res.status(HTTP_STATUS.CLIENT_ERROR.FORBIDDEN).json({
						error:
							"Meeting admins can only view pools for users in their authorized meetings",
					});
					return;
				}
			}

			const pools = await getPoolsForUser(id);
			res.json({ success: true, data: pools });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get user pools: ${message}` });
		}
	},
);

/**
 * Meeting Management Routes
 */

/**
 * POST /api/admin/meetings
 * Create a new meeting
 */
adminRouter.post(
	"/meetings",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const request: Partial<CreateMeetingRequest> = req.body;

			// Validate required fields
			if (
				request.name === undefined ||
				request.name === "" ||
				request.startDate === undefined ||
				request.startDate === "" ||
				request.endDate === undefined ||
				request.endDate === "" ||
				request.quorumVotingPoolId === undefined
			) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error:
						"Missing required fields: name, startDate, endDate, quorumVotingPoolId",
				});
				return;
			}

			// After validation, we know all required fields exist
			const validatedRequest: CreateMeetingRequest = {
				name: request.name,
				startDate: request.startDate,
				endDate: request.endDate,
				quorumVotingPoolId: request.quorumVotingPoolId,
				watcherPoolId: request.watcherPoolId,
				meetingAdminPoolId: request.meetingAdminPoolId,
				description: request.description,
			};

			const meeting = await createMeeting(validatedRequest);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: meeting });
		} catch (error) {
			sendServiceError(res, error, "Failed to create meeting");
		}
	},
);

/**
 * GET /api/admin/meetings
 * List meetings with pagination
 * For global admins: returns all meetings
 * For meeting admins: returns only meetings where user is in admin pool
 */
adminRouter.get("/meetings", async (req: Request, res: Response) => {
	try {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const pageParam =
			typeof req.query.page === "string"
				? req.query.page
				: String(DEFAULT_PAGE);
		const limitParam =
			typeof req.query.limit === "string"
				? req.query.limit
				: String(DEFAULT_LIMIT);
		const page = Number.parseInt(pageParam, DECIMAL_RADIX);
		const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

		// Global admins see all meetings; meeting admins only see their authorized meetings
		const { meetings, total } = req.user.isAdmin
			? await listMeetings(page, limit)
			: await listMeetingsForMeetingAdmin(req.user.id, page, limit);

		const response: MeetingListResponse = {
			success: true,
			data: meetings,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};

		res.json(response);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
			.json({ success: false, error: `Failed to list meetings: ${message}` });
	}
});

// ============================================================================
// Meeting Admin Selection Routes
// These routes allow non-global admins who are meeting admins to select and
// manage the meetings they are authorized to administer
// IMPORTANT: These routes must be defined before /meetings/:id routes
// ============================================================================

/**
 * GET /api/admin/meetings/joinable
 * Get list of meetings the current user can administer
 * For global admins, this returns all meetings (regardless of activity status)
 * For meeting admins, this returns meetings where they are in the admin pool
 */
adminRouter.get("/meetings/joinable", async (req: Request, res: Response) => {
	try {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		// Global admins can join any meeting
		// Meeting admins can only join meetings where they are in the admin pool
		const meetings = req.user.isAdmin
			? await getAllMeetingsForAdmin()
			: await getJoinableMeetingsForAdmin(req.user.id);
		res.json({ success: true, data: meetings });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
			.json({ success: false, error: `Failed to get meetings: ${message}` });
	}
});

/**
 * GET /api/admin/meetings/current
 * Get current meeting for meeting admin
 */
adminRouter.get("/meetings/current", async (req: Request, res: Response) => {
	try {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const meetingInfo = await getCurrentMeetingInfo(req.user.id);
		res.json({ success: true, data: meetingInfo });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
			success: false,
			error: `Failed to get current meeting: ${message}`,
		});
	}
});

/**
 * POST /api/admin/meetings/leave
 * Leave current meeting as meeting admin
 */
adminRouter.post("/meetings/leave", async (req: Request, res: Response) => {
	try {
		if (req.user === undefined) {
			res.status(HTTP_STATUS.CLIENT_ERROR.UNAUTHORIZED).json({
				success: false,
				error: "Authentication required",
			});
			return;
		}

		const success = await leaveCurrentMeeting(req.user.id);
		if (success) {
			res.json({ success: true, data: { left: true } });
		} else {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				success: false,
				error: "Not currently in a meeting",
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
			.json({ success: false, error: `Failed to leave meeting: ${message}` });
	}
});

/**
 * GET /api/admin/meetings/:id
 * Get a single meeting by ID
 */
adminRouter.get(
	"/meetings/:id",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			const meeting = await getMeetingById(meetingId);

			if (meeting === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "Meeting not found" });
				return;
			}

			res.json({ success: true, data: meeting });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get meeting: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/meetings/:id
 * Update meeting details
 */
adminRouter.put(
	"/meetings/:id",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const updates: UpdateMeetingRequest = req.body;
			// Only global admins may change the meeting admin pool for a meeting.
			// Strip meetingAdminPoolId from the update payload for non-global-admins so a
			// scoped meeting admin can't grant admin rights to others.
			if (req.user?.isAdmin !== true && "meetingAdminPoolId" in updates) {
				delete updates.meetingAdminPoolId;
			}
			const meeting = await updateMeeting(meetingId, updates);
			res.json({ success: true, data: meeting });
		} catch (error) {
			sendServiceError(res, error, "Failed to update meeting");
		}
	},
);

/**
 * DELETE /api/admin/meetings/:id
 * Delete a meeting (cascades to motions and choices)
 */
adminRouter.delete(
	"/meetings/:id",
	requireAdmin,
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			await deleteMeeting(meetingId);
			res.json({ success: true, message: "Meeting deleted successfully" });
		} catch (error) {
			sendServiceError(res, error, "Failed to delete meeting");
		}
	},
);

/**
 * POST /api/admin/meetings/:id/join
 * Join a meeting as meeting admin
 */
adminRouter.post(
	"/meetings/:id/join",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
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

			const result = await joinMeetingAsAdmin(
				req.user.id,
				meetingId,
				req.user.isAdmin,
			);
			res.json({ success: true, data: result });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ success: false, error: `Failed to join meeting: ${message}` });
		}
	},
);

/**
 * Voter Pool Management Routes
 */

/**
 * GET /api/admin/meetings/:id/voter-pools
 * Get voter pools for a meeting
 */
adminRouter.get(
	"/meetings/:id/voter-pools",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			if (Number.isNaN(meetingId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid meeting ID",
				});
				return;
			}

			const voterPoolIds = await getVoterPoolsForMeeting(meetingId);
			res.json({ success: true, data: voterPoolIds });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({
				success: false,
				error: `Failed to get voter pools: ${message}`,
			});
		}
	},
);

/**
 * PUT /api/admin/meetings/:id/voter-pools
 * Set voter pools for a meeting (quorum pool always included)
 */
adminRouter.put(
	"/meetings/:id/voter-pools",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			if (Number.isNaN(meetingId)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "Invalid meeting ID",
				});
				return;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: { poolIds?: number[] } = req.body;

			if (!Array.isArray(body.poolIds)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					success: false,
					error: "poolIds must be an array of numbers",
				});
				return;
			}

			const voterPoolIds = await setVoterPoolsForMeeting(
				meetingId,
				body.poolIds,
			);
			res.json({ success: true, data: voterPoolIds });
		} catch (error) {
			sendServiceError(res, error, "Failed to set voter pools");
		}
	},
);

/**
 * Motion Management Routes
 */

/**
 * POST /api/admin/meetings/:meetingId/motions
 * Create a new motion for a meeting
 */
adminRouter.post(
	"/meetings/:meetingId/motions",
	requireMeetingAdmin("meetingId"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.meetingId, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: Partial<Omit<CreateMotionRequest, "meetingId">> = req.body;

			// Validate required fields
			if (
				body.name === undefined ||
				body.name === "" ||
				body.plannedDuration === undefined
			) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required fields: name, plannedDuration",
				});
				return;
			}

			const request: CreateMotionRequest = {
				meetingId,
				name: body.name,
				plannedDuration: body.plannedDuration,
				description: body.description,
				selectionCount: body.selectionCount,
				votingPoolId: body.votingPoolId,
			};

			const motion = await createMotion(request);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: motion });
		} catch (error) {
			sendServiceError(res, error, "Failed to create motion");
		}
	},
);

/**
 * GET /api/admin/meetings/:meetingId/motions
 * List all motions for a meeting with pagination
 */
adminRouter.get(
	"/meetings/:meetingId/motions",
	requireMeetingAdmin("meetingId"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.meetingId, DECIMAL_RADIX);
			const pageParam =
				typeof req.query.page === "string"
					? req.query.page
					: String(DEFAULT_PAGE);
			const limitParam =
				typeof req.query.limit === "string"
					? req.query.limit
					: String(DEFAULT_LIMIT);
			const page = Number.parseInt(pageParam, DECIMAL_RADIX);
			const limit = Number.parseInt(limitParam, DECIMAL_RADIX);

			const { motions, total } = await listMotionsForMeeting(
				meetingId,
				page,
				limit,
			);

			const response: MotionListResponse = {
				success: true,
				data: motions,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ success: false, error: `Failed to list motions: ${message}` });
		}
	},
);

/**
 * GET /api/admin/motions/:id
 * Get a single motion by ID
 */
adminRouter.get(
	"/motions/:id",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			const motion = await getMotionById(motionId);

			if (motion === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "Motion not found" });
				return;
			}

			res.json({ success: true, data: motion });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get motion: ${message}` });
		}
	},
);

/**
 * GET /api/admin/motions/:id/vote-stats
 * Get vote statistics for a motion
 */
adminRouter.get(
	"/motions/:id/vote-stats",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			const stats = await getMotionVoteStats(motionId);
			res.json({ success: true, data: stats });
		} catch (error) {
			sendServiceError(res, error, "Failed to get vote stats");
		}
	},
);

/**
 * GET /api/admin/motions/:id/results
 * Get detailed voting results for a completed motion
 */
adminRouter.get(
	"/motions/:id/results",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			const results = await getMotionDetailedResults(motionId);
			res.json({ success: true, data: results });
		} catch (error) {
			sendServiceError(res, error, "Failed to get motion results");
		}
	},
);

/**
 * PUT /api/admin/motions/:id
 * Update motion details (non-status fields)
 */
adminRouter.put(
	"/motions/:id",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const updates: UpdateMotionRequest = req.body;
			const motion = await updateMotion(motionId, updates);
			res.json({ success: true, data: motion });
		} catch (error) {
			sendServiceError(res, error, "Failed to update motion");
		}
	},
);

/**
 * PUT /api/admin/motions/:id/status
 * Update motion status (forward-only transitions)
 */
adminRouter.put(
	"/motions/:id/status",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: Partial<UpdateMotionStatusRequest> = req.body;

			if (body.status === undefined) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required field: status",
				});
				return;
			}

			const request: UpdateMotionStatusRequest = {
				status: body.status,
				endOverride: body.endOverride,
			};

			const motion = await updateMotionStatus(motionId, request);
			res.json({ success: true, data: motion });
		} catch (error) {
			sendServiceError(res, error, "Failed to update motion status");
		}
	},
);

/**
 * PUT /api/admin/motions/:id/end-override
 * Set or clear end_override for an active motion
 */
adminRouter.put(
	"/motions/:id/end-override",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req.body is any
			const endOverride: string | null = req.body.endOverride ?? null;

			const motion = await setMotionEndOverride(motionId, endOverride);
			res.json({ success: true, data: motion });
		} catch (error) {
			sendServiceError(res, error, "Failed to set end override");
		}
	},
);

/**
 * DELETE /api/admin/motions/:id
 * Delete a motion (cascades to choices)
 */
adminRouter.delete(
	"/motions/:id",
	requireMeetingAdminForMotion("id"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			await deleteMotion(motionId);
			res.json({ success: true, message: "Motion deleted successfully" });
		} catch (error) {
			sendServiceError(res, error, "Failed to delete motion");
		}
	},
);

/**
 * Choice Management Routes
 */

/**
 * POST /api/admin/motions/:motionId/choices
 * Create a new choice for a motion (only if motion not started)
 */
adminRouter.post(
	"/motions/:motionId/choices",
	requireMeetingAdminForMotion("motionId"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.motionId, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: Omit<CreateChoiceRequest, "motionId"> = req.body;

			// Validate required fields
			if (isEmptyString(body.name)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required field: name",
				});
				return;
			}

			// Trim whitespace and build request
			const request: CreateChoiceRequest = {
				...body,
				motionId,
				name: body.name.trim(),
			};

			const choice = await createChoice(request);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: choice });
		} catch (error) {
			sendServiceError(res, error, "Failed to create choice");
		}
	},
);

/**
 * GET /api/admin/motions/:motionId/choices
 * List all choices for a motion (ordered by sort_order)
 */
adminRouter.get(
	"/motions/:motionId/choices",
	requireMeetingAdminForMotion("motionId"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.motionId, DECIMAL_RADIX);
			const choices = await listChoicesForMotion(motionId);

			const response: ChoiceListResponse = {
				success: true,
				data: choices,
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ success: false, error: `Failed to list choices: ${message}` });
		}
	},
);

/**
 * GET /api/admin/choices/:id
 * Get a single choice by ID
 */
adminRouter.get(
	"/choices/:id",
	requireMeetingAdminForChoice("id"),
	async (req: Request, res: Response) => {
		try {
			const choiceId = parseInt(req.params.id, DECIMAL_RADIX);
			const choice = await getChoiceById(choiceId);

			if (choice === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "Choice not found" });
				return;
			}

			res.json({ success: true, data: choice });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get choice: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/choices/:id
 * Update a choice (only if motion not started)
 */
adminRouter.put(
	"/choices/:id",
	requireMeetingAdminForChoice("id"),
	async (req: Request, res: Response) => {
		try {
			const choiceId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const updates: UpdateChoiceRequest = req.body;
			const choice = await updateChoice(choiceId, updates);
			res.json({ success: true, data: choice });
		} catch (error) {
			sendServiceError(res, error, "Failed to update choice");
		}
	},
);

/**
 * PUT /api/admin/motions/:motionId/choices/reorder
 * Reorder choices for a motion (only if motion not started)
 */
adminRouter.put(
	"/motions/:motionId/choices/reorder",
	requireMeetingAdminForMotion("motionId"),
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.motionId, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: Partial<ReorderChoicesRequest> = req.body;

			if (body.choiceIds === undefined || !Array.isArray(body.choiceIds)) {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required field: choiceIds (array)",
				});
				return;
			}

			const choices = await reorderChoices(motionId, body.choiceIds);
			res.json({ success: true, data: choices });
		} catch (error) {
			sendServiceError(res, error, "Failed to reorder choices");
		}
	},
);

/**
 * DELETE /api/admin/choices/:id
 * Delete a choice (only if motion not started)
 */
adminRouter.delete(
	"/choices/:id",
	requireMeetingAdminForChoice("id"),
	async (req: Request, res: Response) => {
		try {
			const choiceId = parseInt(req.params.id, DECIMAL_RADIX);
			await deleteChoice(choiceId);
			res.json({ success: true, message: "Choice deleted successfully" });
		} catch (error) {
			sendServiceError(res, error, "Failed to delete choice");
		}
	},
);

/**
 * Quorum Management Routes
 */

/**
 * GET /api/admin/meetings/:id/quorum
 * Get quorum report for a meeting
 */
adminRouter.get(
	"/meetings/:id/quorum",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			const report = await getQuorumReport(meetingId);

			if (report === null) {
				res
					.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND)
					.json({ error: "Meeting not found" });
				return;
			}

			res.json({ success: true, data: report });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get quorum report: ${message}` });
		}
	},
);

/**
 * PUT /api/admin/meetings/:id/quorum
 * Call or uncall quorum for a meeting
 */
adminRouter.put(
	"/meetings/:id/quorum",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req.body is any
			const quorumCalledAt: string | null = req.body.quorumCalledAt ?? null;

			const timestamp =
				quorumCalledAt === null ? null : new Date(quorumCalledAt);

			await callQuorum(meetingId, timestamp);

			// Return updated quorum report
			const report = await getQuorumReport(meetingId);
			res.json({ success: true, data: report });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to update quorum: ${message}` });
		}
	},
);

/**
 * GET /api/admin/meetings/:id/quorum/voters
 * Get list of active voters for quorum (detailed view)
 */
adminRouter.get(
	"/meetings/:id/quorum/voters",
	requireMeetingAdmin("id"),
	async (req: Request, res: Response) => {
		try {
			const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
			const voters = await getActiveVotersForQuorum(meetingId);
			res.json({ success: true, data: voters });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get active voters: ${message}` });
		}
	},
);

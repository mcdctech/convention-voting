/**
 * Admin API routes for user, pool, meeting, motion, and choice management
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import {
	createUser,
	getUserById,
	listUsers,
	updateUser,
	disableUser,
	enableUser,
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
} from "../services/pool-service.js";
import {
	createMeeting,
	getMeetingById,
	listMeetings,
	updateMeeting,
	deleteMeeting,
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
} from "../services/csv-service.js";
import type {
	CreateUserRequest,
	UpdateUserRequest,
	UserListResponse,
	BulkPasswordResponse,
	PasswordResetResponse,
	CreatePoolRequest,
	UpdatePoolRequest,
	PoolListResponse,
	CreateMeetingRequest,
	UpdateMeetingRequest,
	MeetingListResponse,
	CreateMotionRequest,
	UpdateMotionRequest,
	UpdateMotionStatusRequest,
	MotionListResponse,
	CreateChoiceRequest,
	UpdateChoiceRequest,
	ReorderChoicesRequest,
	ChoiceListResponse,
} from "@mcdc-convention-voting/shared";

export const adminRouter = Router();

// Pagination defaults
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const DECIMAL_RADIX = 10;

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
 * POST /api/admin/users/upload
 * Upload CSV file to bulk create users
 */
adminRouter.post(
	"/users/upload",
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
 * List all users with pagination
 */
adminRouter.get("/users", async (req: Request, res: Response) => {
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

		const { users, total } = await listUsers(page, limit);

		const response: UserListResponse = {
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
			.json({ error: `Failed to list users: ${message}` });
	}
});

/**
 * POST /api/admin/users
 * Create a single user
 */
adminRouter.post("/users", async (req: Request, res: Response) => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const request: CreateUserRequest = req.body;

		// Validate required fields
		if (
			request.voterId === "" ||
			request.firstName === "" ||
			request.lastName === ""
		) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				error: "Missing required fields: voterId, firstName, lastName",
			});
			return;
		}

		const user = await createUser(request);
		res
			.status(HTTP_STATUS.SUCCESSFUL.CREATED)
			.json({ success: true, data: user });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to create user: ${message}` });
	}
});

/**
 * GET /api/admin/users/:id
 * Get a single user by ID
 */
adminRouter.get("/users/:id", async (req: Request, res: Response) => {
	try {
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
});

/**
 * PUT /api/admin/users/:id
 * Update user details
 */
adminRouter.put("/users/:id", async (req: Request, res: Response) => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const updates: UpdateUserRequest = req.body;
		const user = await updateUser(req.params.id, updates);
		res.json({ success: true, data: user });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update user: ${message}` });
	}
});

/**
 * POST /api/admin/users/:id/disable
 * Disable a user
 */
adminRouter.post("/users/:id/disable", async (req: Request, res: Response) => {
	try {
		const user = await disableUser(req.params.id);
		res.json({ success: true, data: user });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to disable user: ${message}` });
	}
});

/**
 * POST /api/admin/users/:id/enable
 * Enable a user
 */
adminRouter.post("/users/:id/enable", async (req: Request, res: Response) => {
	try {
		const user = await enableUser(req.params.id);
		res.json({ success: true, data: user });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to enable user: ${message}` });
	}
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset a user's password
 */
adminRouter.post(
	"/users/:id/reset-password",
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
 * Generate passwords for all users without passwords
 */
adminRouter.post(
	"/users/generate-passwords",
	async (req: Request, res: Response) => {
		try {
			const results = await generatePasswordsForUsers();

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
adminRouter.get("/settings", async (req: Request, res: Response) => {
	try {
		const settings = await getSystemSettings();
		res.json({ success: true, data: settings });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
			.json({ error: `Failed to get settings: ${message}` });
	}
});

/**
 * PUT /api/admin/settings/login-enabled
 * Toggle site-wide non-admin login
 */
adminRouter.put(
	"/settings/login-enabled",
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
 * List all pools with pagination
 */
adminRouter.get("/pools", async (req: Request, res: Response) => {
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

		const { pools, total } = await listPools(page, limit);

		const response: PoolListResponse = {
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
			.json({ error: `Failed to list pools: ${message}` });
	}
});

/**
 * POST /api/admin/pools
 * Create a single pool
 */
adminRouter.post("/pools", async (req: Request, res: Response) => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const request: CreatePoolRequest = req.body;

		// Validate required fields
		if (request.poolKey === "" || request.poolName === "") {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
				error: "Missing required fields: poolKey, poolName",
			});
			return;
		}

		const pool = await createPool(request);
		res
			.status(HTTP_STATUS.SUCCESSFUL.CREATED)
			.json({ success: true, data: pool });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to create pool: ${message}` });
	}
});

/**
 * GET /api/admin/pools/:id
 * Get a single pool by ID
 */
adminRouter.get("/pools/:id", async (req: Request, res: Response) => {
	try {
		const poolId = parseInt(req.params.id, 10);
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
});

/**
 * PUT /api/admin/pools/:id
 * Update pool details
 */
adminRouter.put("/pools/:id", async (req: Request, res: Response) => {
	try {
		const poolId = parseInt(req.params.id, 10);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const updates: UpdatePoolRequest = req.body;
		const pool = await updatePool(poolId, updates);
		res.json({ success: true, data: pool });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update pool: ${message}` });
	}
});

/**
 * POST /api/admin/pools/:id/disable
 * Disable a pool
 */
adminRouter.post("/pools/:id/disable", async (req: Request, res: Response) => {
	try {
		const poolId = parseInt(req.params.id, 10);
		const pool = await disablePool(poolId);
		res.json({ success: true, data: pool });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to disable pool: ${message}` });
	}
});

/**
 * POST /api/admin/pools/:id/enable
 * Enable a pool
 */
adminRouter.post("/pools/:id/enable", async (req: Request, res: Response) => {
	try {
		const poolId = parseInt(req.params.id, 10);
		const pool = await enablePool(poolId);
		res.json({ success: true, data: pool });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to enable pool: ${message}` });
	}
});

/**
 * GET /api/admin/pools/:id/users
 * Get users in a pool
 */
adminRouter.get("/pools/:id/users", async (req: Request, res: Response) => {
	try {
		const poolId = parseInt(req.params.id, 10);
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
			.json({ error: `Failed to get pool users: ${message}` });
	}
});

/**
 * POST /api/admin/pools/:id/users/:userId
 * Add user to pool
 */
adminRouter.post(
	"/pools/:id/users/:userId",
	async (req: Request, res: Response) => {
		try {
			const {
				params: { id, userId },
			} = req;
			const poolId = parseInt(id, 10);

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
	async (req: Request, res: Response) => {
		try {
			const {
				params: { id, userId },
			} = req;
			const poolId = parseInt(id, 10);

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
adminRouter.get("/users/:id/pools", async (req: Request, res: Response) => {
	try {
		const {
			params: { id },
		} = req;
		const pools = await getPoolsForUser(id);
		res.json({ success: true, data: pools });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
			.json({ error: `Failed to get user pools: ${message}` });
	}
});

/**
 * Meeting Management Routes
 */

/**
 * POST /api/admin/meetings
 * Create a new meeting
 */
adminRouter.post("/meetings", async (req: Request, res: Response) => {
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
			description: request.description,
		};

		const meeting = await createMeeting(validatedRequest);
		res
			.status(HTTP_STATUS.SUCCESSFUL.CREATED)
			.json({ success: true, data: meeting });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to create meeting: ${message}` });
	}
});

/**
 * GET /api/admin/meetings
 * List all meetings with pagination
 */
adminRouter.get("/meetings", async (req: Request, res: Response) => {
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

		const { meetings, total } = await listMeetings(page, limit);

		const response: MeetingListResponse = {
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
			.json({ error: `Failed to list meetings: ${message}` });
	}
});

/**
 * GET /api/admin/meetings/:id
 * Get a single meeting by ID
 */
adminRouter.get("/meetings/:id", async (req: Request, res: Response) => {
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
});

/**
 * PUT /api/admin/meetings/:id
 * Update meeting details
 */
adminRouter.put("/meetings/:id", async (req: Request, res: Response) => {
	try {
		const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const updates: UpdateMeetingRequest = req.body;
		const meeting = await updateMeeting(meetingId, updates);
		res.json({ success: true, data: meeting });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update meeting: ${message}` });
	}
});

/**
 * DELETE /api/admin/meetings/:id
 * Delete a meeting (cascades to motions and choices)
 */
adminRouter.delete("/meetings/:id", async (req: Request, res: Response) => {
	try {
		const meetingId = parseInt(req.params.id, DECIMAL_RADIX);
		await deleteMeeting(meetingId);
		res.json({ success: true, message: "Meeting deleted successfully" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to delete meeting: ${message}` });
	}
});

/**
 * Motion Management Routes
 */

/**
 * POST /api/admin/meetings/:meetingId/motions
 * Create a new motion for a meeting
 */
adminRouter.post(
	"/meetings/:meetingId/motions",
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
				seatCount: body.seatCount,
				votingPoolId: body.votingPoolId,
			};

			const motion = await createMotion(request);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: motion });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to create motion: ${message}` });
		}
	},
);

/**
 * GET /api/admin/meetings/:meetingId/motions
 * List all motions for a meeting with pagination
 */
adminRouter.get(
	"/meetings/:meetingId/motions",
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
				.json({ error: `Failed to list motions: ${message}` });
		}
	},
);

/**
 * GET /api/admin/motions/:id
 * Get a single motion by ID
 */
adminRouter.get("/motions/:id", async (req: Request, res: Response) => {
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
});

/**
 * GET /api/admin/motions/:id/vote-stats
 * Get vote statistics for a motion
 */
adminRouter.get(
	"/motions/:id/vote-stats",
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			const stats = await getMotionVoteStats(motionId);
			res.json({ success: true, data: stats });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get vote stats: ${message}` });
		}
	},
);

/**
 * GET /api/admin/motions/:id/results
 * Get detailed voting results for a completed motion
 */
adminRouter.get("/motions/:id/results", async (req: Request, res: Response) => {
	try {
		const motionId = parseInt(req.params.id, DECIMAL_RADIX);
		const results = await getMotionDetailedResults(motionId);
		res.json({ success: true, data: results });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";

		// Return 400 for "not voting_complete" errors
		if (message.includes("voting_complete")) {
			res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({ error: message });
		} else {
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to get motion results: ${message}` });
		}
	}
});

/**
 * PUT /api/admin/motions/:id
 * Update motion details (non-status fields)
 */
adminRouter.put("/motions/:id", async (req: Request, res: Response) => {
	try {
		const motionId = parseInt(req.params.id, DECIMAL_RADIX);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const updates: UpdateMotionRequest = req.body;
		const motion = await updateMotion(motionId, updates);
		res.json({ success: true, data: motion });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update motion: ${message}` });
	}
});

/**
 * PUT /api/admin/motions/:id/status
 * Update motion status (forward-only transitions)
 */
adminRouter.put("/motions/:id/status", async (req: Request, res: Response) => {
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
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update motion status: ${message}` });
	}
});

/**
 * PUT /api/admin/motions/:id/end-override
 * Set or clear end_override for an active motion
 */
adminRouter.put(
	"/motions/:id/end-override",
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.id, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Express req.body is any
			const endOverride: string | null = req.body.endOverride ?? null;

			const motion = await setMotionEndOverride(motionId, endOverride);
			res.json({ success: true, data: motion });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to set end override: ${message}` });
		}
	},
);

/**
 * DELETE /api/admin/motions/:id
 * Delete a motion (cascades to choices)
 */
adminRouter.delete("/motions/:id", async (req: Request, res: Response) => {
	try {
		const motionId = parseInt(req.params.id, DECIMAL_RADIX);
		await deleteMotion(motionId);
		res.json({ success: true, message: "Motion deleted successfully" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to delete motion: ${message}` });
	}
});

/**
 * Choice Management Routes
 */

/**
 * POST /api/admin/motions/:motionId/choices
 * Create a new choice for a motion (only if motion not started)
 */
adminRouter.post(
	"/motions/:motionId/choices",
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.motionId, DECIMAL_RADIX);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
			const body: Omit<CreateChoiceRequest, "motionId"> = req.body;

			// Validate required fields
			if (body.name === "") {
				res.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST).json({
					error: "Missing required field: name",
				});
				return;
			}

			const request: CreateChoiceRequest = {
				...body,
				motionId,
			};

			const choice = await createChoice(request);
			res
				.status(HTTP_STATUS.SUCCESSFUL.CREATED)
				.json({ success: true, data: choice });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to create choice: ${message}` });
		}
	},
);

/**
 * GET /api/admin/motions/:motionId/choices
 * List all choices for a motion (ordered by sort_order)
 */
adminRouter.get(
	"/motions/:motionId/choices",
	async (req: Request, res: Response) => {
		try {
			const motionId = parseInt(req.params.motionId, DECIMAL_RADIX);
			const choices = await listChoicesForMotion(motionId);

			const response: ChoiceListResponse = {
				data: choices,
			};

			res.json(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.SERVER_ERROR.INTERNAL_SERVER_ERROR)
				.json({ error: `Failed to list choices: ${message}` });
		}
	},
);

/**
 * GET /api/admin/choices/:id
 * Get a single choice by ID
 */
adminRouter.get("/choices/:id", async (req: Request, res: Response) => {
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
});

/**
 * PUT /api/admin/choices/:id
 * Update a choice (only if motion not started)
 */
adminRouter.put("/choices/:id", async (req: Request, res: Response) => {
	try {
		const choiceId = parseInt(req.params.id, DECIMAL_RADIX);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express req.body is any
		const updates: UpdateChoiceRequest = req.body;
		const choice = await updateChoice(choiceId, updates);
		res.json({ success: true, data: choice });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to update choice: ${message}` });
	}
});

/**
 * PUT /api/admin/motions/:motionId/choices/reorder
 * Reorder choices for a motion (only if motion not started)
 */
adminRouter.put(
	"/motions/:motionId/choices/reorder",
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
			const message = error instanceof Error ? error.message : "Unknown error";
			res
				.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
				.json({ error: `Failed to reorder choices: ${message}` });
		}
	},
);

/**
 * DELETE /api/admin/choices/:id
 * Delete a choice (only if motion not started)
 */
adminRouter.delete("/choices/:id", async (req: Request, res: Response) => {
	try {
		const choiceId = parseInt(req.params.id, DECIMAL_RADIX);
		await deleteChoice(choiceId);
		res.json({ success: true, message: "Choice deleted successfully" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		res
			.status(HTTP_STATUS.CLIENT_ERROR.BAD_REQUEST)
			.json({ error: `Failed to delete choice: ${message}` });
	}
});

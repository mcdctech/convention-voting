/**
 * Meeting, Motion, and Choice management service
 */
import {
	MotionStatus,
	PoolType,
	type Choice,
	type ChoiceResult,
	type CreateChoiceRequest,
	type CreateMeetingRequest,
	type CreateMotionRequest,
	type Meeting,
	type MeetingWithPool,
	type Motion,
	type MotionDetailedResults,
	type MotionVoteStats,
	type MotionWithPool,
	type Pool,
	type UpdateChoiceRequest,
	type UpdateMeetingRequest,
	type UpdateMotionRequest,
	type UpdateMotionStatusRequest,
} from "@mcdc-convention-voting/shared";
import { db, withTransaction } from "../database/db.js";
import { createPool, generatePoolKeyFromMeetingName } from "./pool-service.js";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const PAGE_OFFSET_ADJUSTMENT = 1;

// Number parsing
const DECIMAL_RADIX = 10;

// Motion defaults
const DEFAULT_SELECTION_COUNT = 1;
const INITIAL_SORT_ORDER = 0;
const SORT_ORDER_INCREMENT = 1;

// Vote statistics constants
const ZERO_VOTES = 0;
const PERCENTAGE_MULTIPLIER = 100;

// Status transitions (forward-only)
const VALID_STATUS_TRANSITIONS: Record<MotionStatus, MotionStatus[]> = {
	[MotionStatus.NotYetStarted]: [MotionStatus.VotingActive],
	[MotionStatus.VotingActive]: [MotionStatus.VotingComplete],
	[MotionStatus.VotingComplete]: [],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify a pool exists, throw error if not
 */
async function verifyPoolExists(
	poolId: number,
	poolType: string,
): Promise<void> {
	const poolCheck = await db.query<{ id: number }>(
		"SELECT id FROM pools WHERE id = :poolId",
		{ poolId },
	);
	if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`${poolType} with ID ${String(poolId)} does not exist`);
	}
}

// Pool name suffixes for auto-created pools
const WATCHER_POOL_SUFFIX = "watchers";
const MEETING_ADMIN_POOL_SUFFIX = "meeting-admins";

// ============================================================================
// Meeting Functions
// ============================================================================

/**
 * Auto-create watcher and meeting admin pools for a new meeting
 */
async function autoCreateMeetingPools(meetingName: string): Promise<{
	watcherPool: Pool;
	meetingAdminPool: Pool;
}> {
	// Generate unique pool keys
	const watcherPoolKey = await generatePoolKeyFromMeetingName(
		meetingName,
		WATCHER_POOL_SUFFIX,
	);
	const meetingAdminPoolKey = await generatePoolKeyFromMeetingName(
		meetingName,
		MEETING_ADMIN_POOL_SUFFIX,
	);

	// Create watcher pool
	const watcherPool = await createPool({
		poolKey: watcherPoolKey,
		poolName: `${meetingName} - Watchers`,
		description: `Watchers for meeting: ${meetingName}`,
		poolType: PoolType.Watcher,
	});

	// Create meeting admin pool
	const meetingAdminPool = await createPool({
		poolKey: meetingAdminPoolKey,
		poolName: `${meetingName} - Meeting Admins`,
		description: `Meeting administrators for: ${meetingName}`,
		poolType: PoolType.MeetingAdmin,
	});

	return { watcherPool, meetingAdminPool };
}

/**
 * Create a new meeting
 * Auto-creates watcher and meeting admin pools
 */
export async function createMeeting(
	request: CreateMeetingRequest,
): Promise<Meeting> {
	const { name, description, startDate, endDate, quorumVotingPoolId } = request;

	// Verify quorum pool exists
	await verifyPoolExists(quorumVotingPoolId, "Pool");

	// Auto-create watcher and meeting admin pools
	const { watcherPool, meetingAdminPool } = await autoCreateMeetingPools(name);

	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO meetings (name, description, start_date, end_date, quorum_voting_pool_id, watcher_pool_id, meeting_admin_pool_id)
		 VALUES (:name, :description, :startDate, :endDate, :quorumVotingPoolId, :watcherPoolId, :meetingAdminPoolId)
		 RETURNING *`,
		{
			name,
			description: description ?? null,
			startDate,
			endDate,
			quorumVotingPoolId,
			watcherPoolId: watcherPool.id,
			meetingAdminPoolId: meetingAdminPool.id,
		},
	);

	const {
		rows: [row],
	} = result;

	// Add quorum pool to voter pools junction table
	await db.query(
		`INSERT INTO meeting_voter_pools (meeting_id, pool_id)
		 VALUES (:meetingId, :poolId)`,
		{ meetingId: row.id, poolId: quorumVotingPoolId },
	);

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		voterPoolIds: [quorumVotingPoolId],
	};
}

/**
 * Get meeting by ID with pool names
 */
export async function getMeetingById(
	meetingId: number,
): Promise<MeetingWithPool | null> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
		quorum_pool_name: string;
		watcher_pool_name: string | null;
		meeting_admin_pool_name: string | null;
	}>(
		`SELECT m.*,
		        qp.pool_name as quorum_pool_name,
		        wp.pool_name as watcher_pool_name,
		        ap.pool_name as meeting_admin_pool_name
		 FROM meetings m
		 INNER JOIN pools qp ON m.quorum_voting_pool_id = qp.id
		 LEFT JOIN pools wp ON m.watcher_pool_id = wp.id
		 LEFT JOIN pools ap ON m.meeting_admin_pool_id = ap.id
		 WHERE m.id = :meetingId`,
		{ meetingId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;

	// Get voter pool IDs
	const voterPoolIds = await getVoterPoolsForMeeting(meetingId);

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.quorum_pool_name,
		watcherPoolName: row.watcher_pool_name,
		meetingAdminPoolName: row.meeting_admin_pool_name,
		voterPoolIds,
	};
}

/**
 * List meetings with pagination
 */
export async function listMeetings(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ meetings: MeetingWithPool[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM meetings",
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated meetings with pool names
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
		quorum_pool_name: string;
		watcher_pool_name: string | null;
		meeting_admin_pool_name: string | null;
	}>(
		`SELECT m.*,
		        qp.pool_name as quorum_pool_name,
		        wp.pool_name as watcher_pool_name,
		        ap.pool_name as meeting_admin_pool_name
		 FROM meetings m
		 INNER JOIN pools qp ON m.quorum_voting_pool_id = qp.id
		 LEFT JOIN pools wp ON m.watcher_pool_id = wp.id
		 LEFT JOIN pools ap ON m.meeting_admin_pool_id = ap.id
		 ORDER BY m.start_date DESC
		 LIMIT :limit OFFSET :offset`,
		{ limit, offset },
	);

	const meetings = result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.quorum_pool_name,
		watcherPoolName: row.watcher_pool_name,
		meetingAdminPoolName: row.meeting_admin_pool_name,
	}));

	return { meetings, total };
}

/**
 * List meetings for a meeting admin (filtered by admin pool membership)
 * Only returns meetings where the user is in the admin pool
 */
export async function listMeetingsForMeetingAdmin(
	userId: string,
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ meetings: MeetingWithPool[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count for meetings where user is in admin pool
	const countResult = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM meetings m
		 INNER JOIN user_pools up ON m.meeting_admin_pool_id = up.pool_id
		 WHERE up.user_id = :userId`,
		{ userId },
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated meetings with pool names, filtered by admin pool membership
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
		quorum_pool_name: string;
		watcher_pool_name: string | null;
		meeting_admin_pool_name: string | null;
	}>(
		`SELECT m.*,
		        qp.pool_name as quorum_pool_name,
		        wp.pool_name as watcher_pool_name,
		        ap.pool_name as meeting_admin_pool_name
		 FROM meetings m
		 INNER JOIN pools qp ON m.quorum_voting_pool_id = qp.id
		 LEFT JOIN pools wp ON m.watcher_pool_id = wp.id
		 LEFT JOIN pools ap ON m.meeting_admin_pool_id = ap.id
		 INNER JOIN user_pools up ON m.meeting_admin_pool_id = up.pool_id
		 WHERE up.user_id = :userId
		 ORDER BY m.start_date DESC
		 LIMIT :limit OFFSET :offset`,
		{ userId, limit, offset },
	);

	const meetings = result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.quorum_pool_name,
		watcherPoolName: row.watcher_pool_name,
		meetingAdminPoolName: row.meeting_admin_pool_name,
	}));

	return { meetings, total };
}

/**
 * Build update clauses for meeting updates
 */
async function buildMeetingUpdateClauses(
	updates: UpdateMeetingRequest,
): Promise<{ setClauses: string[]; values: Record<string, unknown> }> {
	const {
		name,
		description,
		startDate,
		endDate,
		quorumVotingPoolId,
		watcherPoolId,
		meetingAdminPoolId,
	} = updates;

	const setClauses: string[] = [];
	const values: Record<string, unknown> = {};

	if (name !== undefined) {
		setClauses.push(`name = :name`);
		values.name = name;
	}

	if (description !== undefined) {
		setClauses.push(`description = :description`);
		values.description = description;
	}

	if (startDate !== undefined) {
		setClauses.push(`start_date = :startDate`);
		values.startDate = startDate;
	}

	if (endDate !== undefined) {
		setClauses.push(`end_date = :endDate`);
		values.endDate = endDate;
	}

	if (quorumVotingPoolId !== undefined) {
		await verifyPoolExists(quorumVotingPoolId, "Pool");
		setClauses.push(`quorum_voting_pool_id = :quorumVotingPoolId`);
		values.quorumVotingPoolId = quorumVotingPoolId;
	}

	if (watcherPoolId !== undefined) {
		if (watcherPoolId !== null) {
			await verifyPoolExists(watcherPoolId, "Watcher pool");
		}
		setClauses.push(`watcher_pool_id = :watcherPoolId`);
		values.watcherPoolId = watcherPoolId;
	}

	if (meetingAdminPoolId !== undefined) {
		if (meetingAdminPoolId !== null) {
			await verifyPoolExists(meetingAdminPoolId, "Admin pool");
		}
		setClauses.push(`meeting_admin_pool_id = :meetingAdminPoolId`);
		values.meetingAdminPoolId = meetingAdminPoolId;
	}

	return { setClauses, values };
}

/**
 * Update meeting details
 */
export async function updateMeeting(
	meetingId: number,
	updates: UpdateMeetingRequest,
): Promise<Meeting> {
	const { setClauses, values } = await buildMeetingUpdateClauses(updates);
	values.meetingId = meetingId;

	if (setClauses.length === EMPTY_ARRAY_LENGTH) {
		throw new Error("No fields to update");
	}

	// Add updated_at
	setClauses.push(`updated_at = NOW()`);

	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE meetings
		 SET ${setClauses.join(", ")}
		 WHERE id = :meetingId
		 RETURNING *`,
		values,
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Delete a meeting (cascades to motions and choices)
 */
export async function deleteMeeting(meetingId: number): Promise<void> {
	const result = await db.query(
		"DELETE FROM meetings WHERE id = :meetingId RETURNING id",
		{ meetingId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}
}

// ============================================================================
// Voter Pool Junction Table Functions
// ============================================================================

/**
 * Get voter pool IDs for a meeting
 */
export async function getVoterPoolsForMeeting(
	meetingId: number,
): Promise<number[]> {
	const result = await db.query<{ pool_id: number }>(
		`SELECT pool_id FROM meeting_voter_pools
		 WHERE meeting_id = :meetingId
		 ORDER BY created_at ASC`,
		{ meetingId },
	);

	return result.rows.map((row) => row.pool_id);
}

/**
 * Add a voter pool to a meeting
 */
export async function addVoterPoolToMeeting(
	meetingId: number,
	poolId: number,
): Promise<void> {
	// Verify pool exists
	await verifyPoolExists(poolId, "Voter pool");

	await db.query(
		`INSERT INTO meeting_voter_pools (meeting_id, pool_id)
		 VALUES (:meetingId, :poolId)
		 ON CONFLICT (meeting_id, pool_id) DO NOTHING`,
		{ meetingId, poolId },
	);
}

/**
 * Remove a voter pool from a meeting
 * Cannot remove the quorum voting pool
 */
export async function removeVoterPoolFromMeeting(
	meetingId: number,
	poolId: number,
): Promise<void> {
	// Check if this is the quorum pool
	const meetingResult = await db.query<{ quorum_voting_pool_id: number }>(
		"SELECT quorum_voting_pool_id FROM meetings WHERE id = :meetingId",
		{ meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	const {
		rows: [{ quorum_voting_pool_id: quorumPoolId }],
	} = meetingResult;

	if (poolId === quorumPoolId) {
		throw new Error("Cannot remove the quorum voting pool from voter pools");
	}

	await db.query(
		`DELETE FROM meeting_voter_pools
		 WHERE meeting_id = :meetingId AND pool_id = :poolId`,
		{ meetingId, poolId },
	);
}

/**
 * Set all voter pools for a meeting
 * The quorum pool is always included regardless of input
 */
export async function setVoterPoolsForMeeting(
	meetingId: number,
	poolIds: number[],
): Promise<number[]> {
	// Get the quorum pool ID
	const meetingResult = await db.query<{ quorum_voting_pool_id: number }>(
		"SELECT quorum_voting_pool_id FROM meetings WHERE id = :meetingId",
		{ meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	const {
		rows: [{ quorum_voting_pool_id: quorumPoolId }],
	} = meetingResult;

	// Ensure quorum pool is always included
	const finalPoolIds = [...new Set([quorumPoolId, ...poolIds])];

	// Verify all pools exist
	for (const poolId of finalPoolIds) {
		// eslint-disable-next-line no-await-in-loop -- Sequential verification required
		await verifyPoolExists(poolId, "Voter pool");
	}

	return await withTransaction(async (tx) => {
		// Delete existing voter pool associations
		await tx.query(
			"DELETE FROM meeting_voter_pools WHERE meeting_id = :meetingId",
			{ meetingId },
		);

		// Insert new associations
		for (const poolId of finalPoolIds) {
			// eslint-disable-next-line no-await-in-loop -- Sequential inserts in transaction
			await tx.query(
				`INSERT INTO meeting_voter_pools (meeting_id, pool_id)
				 VALUES (:meetingId, :poolId)`,
				{ meetingId, poolId },
			);
		}

		return finalPoolIds;
	});
}

/**
 * Check if a user is in any voter pool for a meeting
 */
export async function isUserInMeetingVoterPools(
	userId: string,
	meetingId: number,
): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		`SELECT EXISTS(
			SELECT 1 FROM meeting_voter_pools mvp
			INNER JOIN user_pools up ON mvp.pool_id = up.pool_id
			WHERE mvp.meeting_id = :meetingId AND up.user_id = :userId
		) as exists`,
		{ meetingId, userId },
	);

	return result.rows[FIRST_ROW].exists;
}

/**
 * Look up the meeting ID that a motion belongs to.
 * Returns null if the motion does not exist.
 */
export async function getMeetingIdForMotion(
	motionId: number,
): Promise<number | null> {
	const result = await db.query<{ meeting_id: number }>(
		"SELECT meeting_id FROM motions WHERE id = :motionId",
		{ motionId },
	);
	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}
	return result.rows[FIRST_ROW].meeting_id;
}

/**
 * Look up the meeting ID that a choice belongs to (via its motion).
 * Returns null if the choice does not exist.
 */
export async function getMeetingIdForChoice(
	choiceId: number,
): Promise<number | null> {
	const result = await db.query<{ meeting_id: number }>(
		`SELECT m.meeting_id
		 FROM choices c
		 INNER JOIN motions m ON c.motion_id = m.id
		 WHERE c.id = :choiceId`,
		{ choiceId },
	);
	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}
	return result.rows[FIRST_ROW].meeting_id;
}

// ============================================================================
// Motion Functions
// ============================================================================

/**
 * Create a new motion (status always defaults to not_yet_started)
 */
export async function createMotion(
	request: CreateMotionRequest,
): Promise<Motion> {
	const {
		meetingId,
		name,
		description,
		plannedDuration,
		selectionCount,
		votingPoolId,
	} = request;

	// Verify meeting exists
	const meetingCheck = await db.query<{ id: number }>(
		"SELECT id FROM meetings WHERE id = :meetingId",
		{ meetingId },
	);
	if (meetingCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} does not exist`);
	}

	// Verify voting pool exists if provided
	if (votingPoolId !== undefined) {
		const poolCheck = await db.query<{ id: number }>(
			"SELECT id FROM pools WHERE id = :poolId",
			{ poolId: votingPoolId },
		);
		if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(`Pool with ID ${String(votingPoolId)} does not exist`);
		}
	}

	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO motions (meeting_id, name, description, planned_duration, selection_count, voting_pool_id)
		 VALUES (:meetingId, :name, :description, :plannedDuration, :selectionCount, :votingPoolId)
		 RETURNING *`,
		{
			meetingId,
			name,
			description: description ?? null,
			plannedDuration,
			selectionCount: selectionCount ?? DEFAULT_SELECTION_COUNT,
			votingPoolId: votingPoolId ?? null,
		},
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get motion by ID with pool name
 */
export async function getMotionById(
	motionId: number,
): Promise<MotionWithPool | null> {
	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
		pool_name: string | null;
	}>(
		`SELECT m.*, p.pool_name
		 FROM motions m
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 WHERE m.id = :motionId`,
		{ motionId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		votingPoolName: row.pool_name,
	};
}

/**
 * List motions for a meeting with pagination
 */
export async function listMotionsForMeeting(
	meetingId: number,
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ motions: MotionWithPool[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM motions WHERE meeting_id = :meetingId",
		{ meetingId },
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated motions with pool names
	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
		pool_name: string | null;
	}>(
		`SELECT m.*, p.pool_name
		 FROM motions m
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 WHERE m.meeting_id = :meetingId
		 ORDER BY m.created_at ASC
		 LIMIT :limit OFFSET :offset`,
		{ meetingId, limit, offset },
	);

	const motions = result.rows.map((row) => ({
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		votingPoolName: row.pool_name,
	}));

	return { motions, total };
}

/**
 * Update motion details (non-status fields)
 */
export async function updateMotion(
	motionId: number,
	updates: UpdateMotionRequest,
): Promise<Motion> {
	const { name, description, plannedDuration, selectionCount, votingPoolId } =
		updates;

	// Build dynamic update query
	const setClauses: string[] = [];
	const values: Record<string, unknown> = { motionId };

	if (name !== undefined) {
		setClauses.push(`name = :name`);
		values.name = name;
	}

	if (description !== undefined) {
		setClauses.push(`description = :description`);
		values.description = description;
	}

	if (plannedDuration !== undefined) {
		setClauses.push(`planned_duration = :plannedDuration`);
		values.plannedDuration = plannedDuration;
	}

	if (selectionCount !== undefined) {
		setClauses.push(`selection_count = :selectionCount`);
		values.selectionCount = selectionCount;
	}

	if (votingPoolId !== undefined) {
		// Verify pool exists
		const poolCheck = await db.query<{ id: number }>(
			"SELECT id FROM pools WHERE id = :poolId",
			{ poolId: votingPoolId },
		);
		if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(`Pool with ID ${String(votingPoolId)} does not exist`);
		}
		setClauses.push(`voting_pool_id = :votingPoolId`);
		values.votingPoolId = votingPoolId;
	}

	if (setClauses.length === EMPTY_ARRAY_LENGTH) {
		throw new Error("No fields to update");
	}

	// Add updated_at
	setClauses.push(`updated_at = NOW()`);

	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE motions
		 SET ${setClauses.join(", ")}
		 WHERE id = :motionId
		 RETURNING *`,
		values,
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Update motion status (forward-only transitions)
 */
export async function updateMotionStatus(
	motionId: number,
	request: UpdateMotionStatusRequest,
): Promise<Motion> {
	const { status: newStatus, endOverride } = request;

	// Get current motion status
	const currentMotion = await db.query<{ status: string }>(
		"SELECT status FROM motions WHERE id = :motionId",
		{ motionId },
	);

	if (currentMotion.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [{ status: currentStatusString }],
	} = currentMotion;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
	const currentStatus = currentStatusString as MotionStatus;

	// Validate status transition
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Dynamic key access
	const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
	if (!allowedTransitions.includes(newStatus)) {
		throw new Error(
			`Invalid status transition: cannot change from '${currentStatus}' to '${newStatus}'`,
		);
	}

	// Validate end_override
	if (endOverride !== undefined && newStatus !== MotionStatus.VotingActive) {
		throw new Error(
			"end_override can only be set when status is 'voting_active'",
		);
	}

	// Build update query with conditional voting_started_at and voting_ended_at
	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE motions
		 SET status = :newStatus::motion_status,
		     voting_started_at = CASE
		       WHEN :newStatus::motion_status = 'voting_active'::motion_status AND voting_started_at IS NULL
		       THEN NOW()
		       ELSE voting_started_at
		     END,
		     voting_ended_at = CASE
		       WHEN :newStatus::motion_status = 'voting_complete'::motion_status AND voting_ended_at IS NULL
		       THEN NOW()
		       ELSE voting_ended_at
		     END,
		     end_override = COALESCE(:endOverride, end_override),
		     updated_at = NOW()
		 WHERE id = :motionId
		 RETURNING *`,
		{
			motionId,
			newStatus,
			endOverride: endOverride ?? null,
		},
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Set end_override for an active motion
 */
export async function setMotionEndOverride(
	motionId: number,
	endOverride: string | null,
): Promise<Motion> {
	// Get current motion status
	const currentMotion = await db.query<{ status: string }>(
		"SELECT status FROM motions WHERE id = :motionId",
		{ motionId },
	);

	if (currentMotion.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [{ status: currentStatusString }],
	} = currentMotion;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
	const currentStatus = currentStatusString as MotionStatus;

	// Validate motion is in voting_active status
	if (currentStatus !== MotionStatus.VotingActive) {
		throw new Error(
			"end_override can only be set when motion status is 'voting_active'",
		);
	}

	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		selection_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE motions
		 SET end_override = :endOverride, updated_at = NOW()
		 WHERE id = :motionId
		 RETURNING *`,
		{ motionId, endOverride },
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		meetingId: row.meeting_id,
		name: row.name,
		description: row.description,
		plannedDuration: row.planned_duration,
		selectionCount: row.selection_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
		votingStartedAt: row.voting_started_at,
		votingEndedAt: row.voting_ended_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Delete a motion (cascades to choices)
 */
export async function deleteMotion(motionId: number): Promise<void> {
	const result = await db.query(
		"DELETE FROM motions WHERE id = :motionId RETURNING id",
		{ motionId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}
}

// ============================================================================
// Choice Functions
// ============================================================================

/**
 * Validate that a motion is in not_yet_started status
 */
async function validateMotionNotStarted(motionId: number): Promise<void> {
	const result = await db.query<{ status: string }>(
		"SELECT status FROM motions WHERE id = :motionId",
		{ motionId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [{ status }],
	} = result;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- Database enum returns as string
	if (status !== MotionStatus.NotYetStarted) {
		throw new Error("Cannot modify choices after voting has started");
	}
}

/**
 * Create a new choice for a motion (only if motion not started)
 */
export async function createChoice(
	request: CreateChoiceRequest,
): Promise<Choice> {
	const { motionId, name, sortOrder } = request;

	// Validate motion is not started
	await validateMotionNotStarted(motionId);

	// If no sort order provided, get the next available
	let finalSortOrder = sortOrder;
	if (finalSortOrder === undefined) {
		const maxResult = await db.query<{ max_order: number | null }>(
			"SELECT MAX(sort_order) as max_order FROM choices WHERE motion_id = :motionId",
			{ motionId },
		);
		const {
			rows: [{ max_order: maxOrder }],
		} = maxResult;
		if (maxOrder === null) {
			finalSortOrder = INITIAL_SORT_ORDER;
		} else {
			finalSortOrder = maxOrder + SORT_ORDER_INCREMENT;
		}
	}

	const result = await db.query<{
		id: number;
		motion_id: number;
		name: string;
		sort_order: number;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO choices (motion_id, name, sort_order)
		 VALUES (:motionId, :name, :sortOrder)
		 RETURNING *`,
		{ motionId, name, sortOrder: finalSortOrder },
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		motionId: row.motion_id,
		name: row.name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get choice by ID
 */
export async function getChoiceById(choiceId: number): Promise<Choice | null> {
	const result = await db.query<{
		id: number;
		motion_id: number;
		name: string;
		sort_order: number;
		created_at: Date;
		updated_at: Date;
	}>("SELECT * FROM choices WHERE id = :choiceId", { choiceId });

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		motionId: row.motion_id,
		name: row.name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * List choices for a motion (ordered by sort_order)
 */
export async function listChoicesForMotion(
	motionId: number,
): Promise<Choice[]> {
	const result = await db.query<{
		id: number;
		motion_id: number;
		name: string;
		sort_order: number;
		created_at: Date;
		updated_at: Date;
	}>(
		`SELECT * FROM choices
		 WHERE motion_id = :motionId
		 ORDER BY sort_order ASC`,
		{ motionId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		motionId: row.motion_id,
		name: row.name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}

/**
 * Update a choice (only if motion not started)
 */
export async function updateChoice(
	choiceId: number,
	updates: UpdateChoiceRequest,
): Promise<Choice> {
	const { name, sortOrder } = updates;

	// Get the choice's motion ID
	const choiceResult = await db.query<{ motion_id: number }>(
		"SELECT motion_id FROM choices WHERE id = :choiceId",
		{ choiceId },
	);

	if (choiceResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Choice with ID ${String(choiceId)} not found`);
	}

	const {
		rows: [{ motion_id: motionId }],
	} = choiceResult;

	// Validate motion is not started
	await validateMotionNotStarted(motionId);

	// Build dynamic update query
	const setClauses: string[] = [];
	const values: Record<string, unknown> = { choiceId };

	if (name !== undefined) {
		setClauses.push(`name = :name`);
		values.name = name;
	}

	if (sortOrder !== undefined) {
		setClauses.push(`sort_order = :sortOrder`);
		values.sortOrder = sortOrder;
	}

	if (setClauses.length === EMPTY_ARRAY_LENGTH) {
		throw new Error("No fields to update");
	}

	// Add updated_at
	setClauses.push(`updated_at = NOW()`);

	const result = await db.query<{
		id: number;
		motion_id: number;
		name: string;
		sort_order: number;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE choices
		 SET ${setClauses.join(", ")}
		 WHERE id = :choiceId
		 RETURNING *`,
		values,
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		motionId: row.motion_id,
		name: row.name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Reorder choices for a motion (only if motion not started)
 */
export async function reorderChoices(
	motionId: number,
	choiceIds: number[],
): Promise<Choice[]> {
	// Validate motion is not started
	await validateMotionNotStarted(motionId);

	// Update sort_order for each choice
	for (let i = 0; i < choiceIds.length; i += SORT_ORDER_INCREMENT) {
		// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Dynamic index access
		const choiceId = choiceIds[i];
		// eslint-disable-next-line no-await-in-loop -- Sequential updates required for ordering
		await db.query(
			`UPDATE choices
			 SET sort_order = :sortOrder, updated_at = NOW()
			 WHERE id = :choiceId AND motion_id = :motionId`,
			{ sortOrder: i, choiceId, motionId },
		);
	}

	// Return updated choices
	return await listChoicesForMotion(motionId);
}

/**
 * Delete a choice (only if motion not started)
 */
export async function deleteChoice(choiceId: number): Promise<void> {
	// Get the choice's motion ID
	const choiceResult = await db.query<{ motion_id: number }>(
		"SELECT motion_id FROM choices WHERE id = :choiceId",
		{ choiceId },
	);

	if (choiceResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Choice with ID ${String(choiceId)} not found`);
	}

	const {
		rows: [{ motion_id: motionId }],
	} = choiceResult;

	// Validate motion is not started
	await validateMotionNotStarted(motionId);

	await db.query("DELETE FROM choices WHERE id = :choiceId", { choiceId });
}

// ============================================================================
// Vote Statistics Functions
// ============================================================================

/**
 * Get vote statistics for a motion
 * Returns aggregate vote counts and participation rate
 */
export async function getMotionVoteStats(
	motionId: number,
): Promise<MotionVoteStats> {
	// Query combining vote counts and eligible voter counts
	const result = await db.query<{
		total_votes: string;
		eligible_voters: string;
	}>(
		`WITH vote_counts AS (
			SELECT COUNT(*) as total_votes
			FROM votes
			WHERE motion_id = :motionId
		),
		eligible_count AS (
			SELECT COUNT(DISTINCT up.user_id) as eligible_voters
			FROM motions m
			INNER JOIN meetings mt ON m.meeting_id = mt.id
			INNER JOIN user_pools up ON up.pool_id = COALESCE(m.voting_pool_id, mt.quorum_voting_pool_id)
			WHERE m.id = :motionId
		)
		SELECT
			COALESCE(vc.total_votes, 0) as total_votes,
			ec.eligible_voters
		FROM vote_counts vc
		CROSS JOIN eligible_count ec`,
		{ motionId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [row],
	} = result;

	const totalVotes = parseInt(row.total_votes, DECIMAL_RADIX);
	const eligibleVoters = parseInt(row.eligible_voters, DECIMAL_RADIX);

	// Calculate participation rate, handling division by zero
	const participationRate =
		eligibleVoters > ZERO_VOTES
			? (totalVotes / eligibleVoters) * PERCENTAGE_MULTIPLIER
			: ZERO_VOTES;

	return {
		motionId,
		totalVotes,
		eligibleVoters,
		participationRate,
		lastUpdated: new Date(),
	};
}

/**
 * Get detailed voting results for a completed motion
 * Only returns results if motion status is voting_complete
 *
 * Privacy: Results are aggregated by choice. No individual voter information exposed.
 */
export async function getMotionDetailedResults(
	motionId: number,
): Promise<MotionDetailedResults> {
	// Step 1: Verify motion exists and is voting_complete
	const motion = await getMotionById(motionId);
	if (motion === null) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	if (motion.status !== MotionStatus.VotingComplete) {
		throw new Error(
			"Detailed results are only available for completed motions (status: voting_complete)",
		);
	}

	// Step 2: Get eligible voter count (same query as getMotionVoteStats)
	const eligibleVotersResult = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT up.user_id) as count
		 FROM motions m
		 INNER JOIN meetings mt ON m.meeting_id = mt.id
		 INNER JOIN user_pools up ON up.pool_id = COALESCE(m.voting_pool_id, mt.quorum_voting_pool_id)
		 WHERE m.id = :motionId`,
		{ motionId },
	);

	if (eligibleVotersResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(
			`Failed to get eligible voters for motion ${String(motionId)}`,
		);
	}

	const eligibleVoters = parseInt(
		eligibleVotersResult.rows[FIRST_ROW].count,
		DECIMAL_RADIX,
	);

	// Step 3: Get total votes and abstention count
	const voteCountResult = await db.query<{
		total_votes: string;
		abstention_count: string;
	}>(
		`SELECT
			COUNT(*) as total_votes,
			COUNT(*) FILTER (WHERE is_abstain = true) as abstention_count
		 FROM votes
		 WHERE motion_id = :motionId`,
		{ motionId },
	);

	const totalVotesIncludingAbstentions = parseInt(
		voteCountResult.rows[FIRST_ROW].total_votes,
		DECIMAL_RADIX,
	);
	const abstentionCount = parseInt(
		voteCountResult.rows[FIRST_ROW].abstention_count,
		DECIMAL_RADIX,
	);

	const totalVotesForChoices = totalVotesIncludingAbstentions - abstentionCount;

	// Step 4: Get vote counts per choice
	const choiceResultsQuery = await db.query<{
		choice_id: number;
		choice_name: string;
		vote_count: string;
	}>(
		`SELECT
			c.id as choice_id,
			c.name as choice_name,
			COUNT(vc.vote_id) as vote_count
		 FROM choices c
		 LEFT JOIN vote_choices vc ON c.id = vc.choice_id
		 LEFT JOIN votes v ON vc.vote_id = v.id AND v.motion_id = :motionId
		 WHERE c.motion_id = :motionId
		 GROUP BY c.id, c.name
		 ORDER BY vote_count DESC, c.name ASC`,
		{ motionId },
	);

	// Step 5: Calculate percentages and determine winners
	const choiceResults: ChoiceResult[] = choiceResultsQuery.rows.map(
		(row, index) => {
			const voteCount = parseInt(row.vote_count, DECIMAL_RADIX);
			const percentage =
				totalVotesForChoices > ZERO_VOTES
					? (voteCount / totalVotesForChoices) * PERCENTAGE_MULTIPLIER
					: ZERO_VOTES;

			// Winner determination: top selection_count choices by vote count
			const isWinner = index < motion.selectionCount;

			return {
				choiceId: row.choice_id,
				choiceName: row.choice_name,
				voteCount,
				percentage,
				isWinner,
			};
		},
	);

	// Step 6: Calculate participation and abstention percentages
	const participationRate =
		eligibleVoters > ZERO_VOTES
			? (totalVotesIncludingAbstentions / eligibleVoters) *
				PERCENTAGE_MULTIPLIER
			: ZERO_VOTES;

	const abstentionPercentage =
		totalVotesIncludingAbstentions > ZERO_VOTES
			? (abstentionCount / totalVotesIncludingAbstentions) *
				PERCENTAGE_MULTIPLIER
			: ZERO_VOTES;

	return {
		motionId: motion.id,
		motionName: motion.name,
		selectionCount: motion.selectionCount,
		totalVotesIncludingAbstentions,
		totalVotesForChoices,
		abstentionCount,
		abstentionPercentage,
		eligibleVoters,
		participationRate,
		choiceResults,
		hasQuorum: true, // Future enhancement: implement actual quorum rules
	};
}

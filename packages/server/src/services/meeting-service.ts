/**
 * Meeting, Motion, and Choice management service
 */
import {
	MotionStatus,
	type Choice,
	type CreateChoiceRequest,
	type CreateMeetingRequest,
	type CreateMotionRequest,
	type Meeting,
	type MeetingWithPool,
	type Motion,
	type MotionWithPool,
	type UpdateChoiceRequest,
	type UpdateMeetingRequest,
	type UpdateMotionRequest,
	type UpdateMotionStatusRequest,
} from "@mcdc-convention-voting/shared";
import { db } from "../database/db.js";

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
const DEFAULT_SEAT_COUNT = 1;
const INITIAL_SORT_ORDER = 0;
const SORT_ORDER_INCREMENT = 1;

// Status transitions (forward-only)
const VALID_STATUS_TRANSITIONS: Record<MotionStatus, MotionStatus[]> = {
	[MotionStatus.NotYetStarted]: [MotionStatus.VotingActive],
	[MotionStatus.VotingActive]: [MotionStatus.VotingComplete],
	[MotionStatus.VotingComplete]: [],
};

// ============================================================================
// Meeting Functions
// ============================================================================

/**
 * Create a new meeting
 */
export async function createMeeting(
	request: CreateMeetingRequest,
): Promise<Meeting> {
	const { name, description, startDate, endDate, quorumVotingPoolId } = request;

	// Verify pool exists
	const poolCheck = await db.query<{ id: number }>(
		"SELECT id FROM pools WHERE id = :poolId",
		{ poolId: quorumVotingPoolId },
	);
	if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(
			`Pool with ID ${String(quorumVotingPoolId)} does not exist`,
		);
	}

	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO meetings (name, description, start_date, end_date, quorum_voting_pool_id)
		 VALUES (:name, :description, :startDate, :endDate, :quorumVotingPoolId)
		 RETURNING *`,
		{
			name,
			description: description ?? null,
			startDate,
			endDate,
			quorumVotingPoolId,
		},
	);

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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get meeting by ID with pool name
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
		created_at: Date;
		updated_at: Date;
		pool_name: string;
	}>(
		`SELECT m.*, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 WHERE m.id = :meetingId`,
		{ meetingId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.pool_name,
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
		created_at: Date;
		updated_at: Date;
		pool_name: string;
	}>(
		`SELECT m.*, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
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
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.pool_name,
	}));

	return { meetings, total };
}

/**
 * Update meeting details
 */
export async function updateMeeting(
	meetingId: number,
	updates: UpdateMeetingRequest,
): Promise<Meeting> {
	const { name, description, startDate, endDate, quorumVotingPoolId } = updates;

	// Build dynamic update query
	const setClauses: string[] = [];
	const values: Record<string, unknown> = { meetingId };

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
		// Verify pool exists
		const poolCheck = await db.query<{ id: number }>(
			"SELECT id FROM pools WHERE id = :poolId",
			{ poolId: quorumVotingPoolId },
		);
		if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(
				`Pool with ID ${String(quorumVotingPoolId)} does not exist`,
			);
		}
		setClauses.push(`quorum_voting_pool_id = :quorumVotingPoolId`);
		values.quorumVotingPoolId = quorumVotingPoolId;
	}

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
		seatCount,
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
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO motions (meeting_id, name, description, planned_duration, seat_count, voting_pool_id)
		 VALUES (:meetingId, :name, :description, :plannedDuration, :seatCount, :votingPoolId)
		 RETURNING *`,
		{
			meetingId,
			name,
			description: description ?? null,
			plannedDuration,
			seatCount: seatCount ?? DEFAULT_SEAT_COUNT,
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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
	const { name, description, plannedDuration, seatCount, votingPoolId } =
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

	if (seatCount !== undefined) {
		setClauses.push(`seat_count = :seatCount`);
		values.seatCount = seatCount;
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
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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

	// Build update query
	const setClauses = ["status = :newStatus", "updated_at = NOW()"];
	const values: Record<string, unknown> = { motionId, newStatus };

	if (endOverride !== undefined) {
		setClauses.push("end_override = :endOverride");
		values.endOverride = endOverride;
	}

	const result = await db.query<{
		id: number;
		meeting_id: number;
		name: string;
		description: string | null;
		planned_duration: number;
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE motions
		 SET ${setClauses.join(", ")}
		 WHERE id = :motionId
		 RETURNING *`,
		values,
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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
		seat_count: number;
		voting_pool_id: number | null;
		status: string;
		end_override: Date | null;
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
		seatCount: row.seat_count,
		votingPoolId: row.voting_pool_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		status: row.status as MotionStatus,
		endOverride: row.end_override,
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

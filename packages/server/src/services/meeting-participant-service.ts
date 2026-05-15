/**
 * Meeting Participant service
 * Handles user participation in meetings (joining, leaving, quorum tracking)
 */
import {
	ParticipantRole,
	ServiceErrorCode,
	type CurrentMeetingInfo,
	type JoinableMeeting,
	type MeetingParticipant,
	type MeetingWithPool,
} from "@mcdc-convention-voting/shared";
import { db, withTransaction } from "../database/db.js";
import { ServiceError } from "../errors/service-error.js";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

/**
 * Database row type for meeting_participants table
 */
interface MeetingParticipantRow {
	id: number;
	user_id: string;
	meeting_id: number;
	role: string;
	joined_at: Date;
	left_at: Date | null;
	quorum_counted_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

/**
 * Convert database row to MeetingParticipant
 */
function rowToMeetingParticipant(
	row: MeetingParticipantRow,
): MeetingParticipant {
	return {
		id: row.id,
		userId: row.user_id,
		meetingId: row.meeting_id,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		role: row.role as ParticipantRole,
		joinedAt: row.joined_at,
		leftAt: row.left_at,
		quorumCountedAt: row.quorum_counted_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get the user's current active meeting participation (left_at IS NULL)
 */
export async function getCurrentParticipation(
	userId: string,
): Promise<MeetingParticipant | null> {
	const result = await db.query<MeetingParticipantRow>(
		`SELECT * FROM meeting_participants
		 WHERE user_id = :userId AND left_at IS NULL
		 ORDER BY joined_at DESC
		 LIMIT 1`,
		{ userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	return rowToMeetingParticipant(result.rows[FIRST_ROW]);
}

/**
 * Get current meeting info for a user
 * Returns meeting details along with participation record
 */
export async function getCurrentMeetingInfo(
	userId: string,
): Promise<CurrentMeetingInfo | null> {
	const participation = await getCurrentParticipation(userId);

	if (participation === null) {
		return null;
	}

	// Get meeting details with pool names
	const meetingResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		quorum_percentage: string;
		quorum_eligible_snapshot: number | null;
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
		{ meetingId: participation.meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = meetingResult;
	const meeting: MeetingWithPool = {
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolId: row.quorum_voting_pool_id,
		quorumPercentage: parseFloat(row.quorum_percentage),
		quorumEligibleSnapshot: row.quorum_eligible_snapshot,
		watcherPoolId: row.watcher_pool_id,
		meetingAdminPoolId: row.meeting_admin_pool_id,
		quorumCalledAt: row.quorum_called_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quorumVotingPoolName: row.quorum_pool_name,
		watcherPoolName: row.watcher_pool_name,
		meetingAdminPoolName: row.meeting_admin_pool_name,
	};

	return {
		meeting,
		participant: participation,
	};
}

/**
 * Get active meetings that a user can join as a voter
 * Returns meetings where:
 * - Meeting is currently active (now between start_date and end_date)
 * - User is in the meeting's quorum_voting_pool
 * - User is not already in any meeting
 */
export async function getJoinableMeetingsForVoter(
	userId: string,
): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT DISTINCT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 INNER JOIN user_pools up ON up.pool_id = m.quorum_voting_pool_id
		 WHERE up.user_id = :userId
		   AND NOW() >= m.start_date
		   AND NOW() <= m.end_date
		 ORDER BY m.start_date ASC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.Voter,
	}));
}

/**
 * Get upcoming meetings that a voter is eligible for
 * Returns meetings where:
 * - Meeting has not started yet (now < start_date)
 * - User is in the meeting's quorum_voting_pool
 * These are displayed for information only - user cannot join them yet
 */
export async function getUpcomingMeetingsForVoter(
	userId: string,
): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT DISTINCT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 INNER JOIN user_pools up ON up.pool_id = m.quorum_voting_pool_id
		 WHERE up.user_id = :userId
		   AND NOW() < m.start_date
		 ORDER BY m.start_date ASC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.Voter,
	}));
}

/**
 * Join a meeting as a voter.
 *
 * Validation (meeting is active, user is in the quorum pool) runs outside the
 * transaction. The UPDATE that leaves any current meeting and the INSERT of
 * the new participation row run atomically inside a single transaction, so a
 * failed INSERT rolls the leave back.
 *
 * Quorum counting is decided by the INSERT itself via a CASE/EXISTS expression,
 * so there is no window where `callQuorum` could interleave between a "should
 * count" check and the write — the decision is made in the same statement.
 */
export async function joinMeetingAsVoter(
	userId: string,
	meetingId: number,
): Promise<{ participant: MeetingParticipant; meeting: MeetingWithPool }> {
	// Verify meeting exists and is active
	const meetingResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		quorum_percentage: string;
		quorum_eligible_snapshot: number | null;
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
		 WHERE m.id = :meetingId
		   AND NOW() >= m.start_date
		   AND NOW() <= m.end_date`,
		{ meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.MEETING_NOT_ACTIVE,
			"Meeting not found or not currently active",
		);
	}

	// Verify user is in the quorum pool
	const poolCheck = await db.query<{ user_id: string }>(
		`SELECT up.user_id FROM user_pools up
		 INNER JOIN meetings m ON m.quorum_voting_pool_id = up.pool_id
		 WHERE m.id = :meetingId AND up.user_id = :userId`,
		{ meetingId, userId },
	);

	if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.NOT_ELIGIBLE_FOR_MEETING,
			"User is not eligible to join this meeting as a voter",
		);
	}

	const insertedRow = await withTransaction(async (tx) => {
		await tx.query(
			`UPDATE meeting_participants
			 SET left_at = NOW(), updated_at = NOW()
			 WHERE user_id = :userId AND left_at IS NULL`,
			{ userId },
		);

		const insertResult = await tx.query<MeetingParticipantRow>(
			`INSERT INTO meeting_participants (user_id, meeting_id, role, quorum_counted_at)
			 VALUES (
			   :userId,
			   :meetingId,
			   'voter',
			   CASE
			     WHEN EXISTS (
			       SELECT 1 FROM meetings
			       WHERE id = :meetingId AND quorum_called_at IS NULL
			     )
			     AND NOT EXISTS (
			       SELECT 1 FROM meeting_participants
			       WHERE user_id = :userId
			         AND meeting_id = :meetingId
			         AND role = 'voter'
			         AND quorum_counted_at IS NOT NULL
			     )
			     THEN NOW()
			     ELSE NULL
			   END
			 )
			 RETURNING *`,
			{ userId, meetingId },
		);

		return insertResult.rows[FIRST_ROW];
	});

	const participant = rowToMeetingParticipant(insertedRow);

	const {
		rows: [meetingRow],
	} = meetingResult;
	const meeting: MeetingWithPool = {
		id: meetingRow.id,
		name: meetingRow.name,
		description: meetingRow.description,
		startDate: meetingRow.start_date,
		endDate: meetingRow.end_date,
		quorumVotingPoolId: meetingRow.quorum_voting_pool_id,
		quorumPercentage: parseFloat(meetingRow.quorum_percentage),
		quorumEligibleSnapshot: meetingRow.quorum_eligible_snapshot,
		watcherPoolId: meetingRow.watcher_pool_id,
		meetingAdminPoolId: meetingRow.meeting_admin_pool_id,
		quorumCalledAt: meetingRow.quorum_called_at,
		createdAt: meetingRow.created_at,
		updatedAt: meetingRow.updated_at,
		quorumVotingPoolName: meetingRow.quorum_pool_name,
		watcherPoolName: meetingRow.watcher_pool_name,
		meetingAdminPoolName: meetingRow.meeting_admin_pool_name,
	};

	return { participant, meeting };
}

/**
 * Leave the user's current meeting
 * Sets left_at timestamp on active participation record
 */
export async function leaveCurrentMeeting(userId: string): Promise<boolean> {
	const result = await db.query(
		`UPDATE meeting_participants
		 SET left_at = NOW(), updated_at = NOW()
		 WHERE user_id = :userId AND left_at IS NULL
		 RETURNING id`,
		{ userId },
	);

	return result.rows.length > EMPTY_ARRAY_LENGTH;
}

/**
 * Get count of voters who have been counted for quorum in a meeting
 */
export async function getQuorumParticipantCount(
	meetingId: number,
): Promise<number> {
	const result = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM meeting_participants
		 WHERE meeting_id = :meetingId
		   AND role = 'voter'
		   AND quorum_counted_at IS NOT NULL`,
		{ meetingId },
	);

	const DECIMAL_RADIX = 10;
	return parseInt(result.rows[FIRST_ROW].count, DECIMAL_RADIX);
}

/**
 * Get list of voters counted for quorum in a meeting
 */
export async function getQuorumParticipants(meetingId: number): Promise<
	Array<{
		userId: string;
		username: string;
		firstName: string;
		lastName: string;
		countedAt: Date;
	}>
> {
	const result = await db.query<{
		user_id: string;
		username: string;
		first_name: string;
		last_name: string;
		quorum_counted_at: Date;
	}>(
		`SELECT mp.user_id, u.username, u.first_name, u.last_name, mp.quorum_counted_at
		 FROM meeting_participants mp
		 INNER JOIN users u ON mp.user_id = u.id
		 WHERE mp.meeting_id = :meetingId
		   AND mp.role = 'voter'
		   AND mp.quorum_counted_at IS NOT NULL
		 ORDER BY mp.quorum_counted_at ASC`,
		{ meetingId },
	);

	return result.rows.map((row) => ({
		userId: row.user_id,
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		countedAt: row.quorum_counted_at,
	}));
}

/**
 * Get count of currently active participants in a meeting
 */
export async function getActiveParticipantCount(
	meetingId: number,
): Promise<number> {
	const result = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM meeting_participants
		 WHERE meeting_id = :meetingId AND left_at IS NULL`,
		{ meetingId },
	);

	const DECIMAL_RADIX = 10;
	return parseInt(result.rows[FIRST_ROW].count, DECIMAL_RADIX);
}

// ============================================================================
// Watcher Meeting Functions
// ============================================================================

/**
 * Get active meetings that a user can join as a watcher
 * Returns meetings where:
 * - Meeting is currently active (now between start_date and end_date)
 * - User is in the meeting's watcher_pool
 */
export async function getJoinableMeetingsForWatcher(
	userId: string,
): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT DISTINCT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.watcher_pool_id = p.id
		 INNER JOIN user_pools up ON up.pool_id = m.watcher_pool_id
		 WHERE up.user_id = :userId
		   AND NOW() >= m.start_date
		   AND NOW() <= m.end_date
		   AND m.watcher_pool_id IS NOT NULL
		 ORDER BY m.start_date ASC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.Watcher,
	}));
}

/**
 * Get upcoming meetings that a watcher is eligible for
 * Returns meetings where:
 * - Meeting has not started yet (now < start_date)
 * - User is in the meeting's watcher_pool
 * These are displayed for information only - user cannot join them yet
 */
export async function getUpcomingMeetingsForWatcher(
	userId: string,
): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT DISTINCT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.watcher_pool_id = p.id
		 INNER JOIN user_pools up ON up.pool_id = m.watcher_pool_id
		 WHERE up.user_id = :userId
		   AND NOW() < m.start_date
		   AND m.watcher_pool_id IS NOT NULL
		 ORDER BY m.start_date ASC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.Watcher,
	}));
}

/**
 * Join a meeting as a watcher
 * - Leaves any current meeting first
 * - Creates new participation record (no quorum counting for watchers)
 */
export async function joinMeetingAsWatcher(
	userId: string,
	meetingId: number,
): Promise<{ participant: MeetingParticipant; meeting: MeetingWithPool }> {
	// Verify meeting exists, is active, and has a watcher pool
	const meetingResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		quorum_percentage: string;
		quorum_eligible_snapshot: number | null;
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
		 WHERE m.id = :meetingId
		   AND NOW() >= m.start_date
		   AND NOW() <= m.end_date
		   AND m.watcher_pool_id IS NOT NULL`,
		{ meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.MEETING_NOT_ACTIVE,
			"Meeting not found, not currently active, or does not allow watchers",
		);
	}

	// Verify user is in the watcher pool
	const poolCheck = await db.query<{ user_id: string }>(
		`SELECT up.user_id FROM user_pools up
		 INNER JOIN meetings m ON m.watcher_pool_id = up.pool_id
		 WHERE m.id = :meetingId AND up.user_id = :userId`,
		{ meetingId, userId },
	);

	if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			ServiceErrorCode.NOT_ELIGIBLE_FOR_MEETING,
			"User is not eligible to join this meeting as a watcher",
		);
	}

	// Leave any current meeting and insert the new watcher participation in a
	// single transaction so a failed INSERT rolls the leave back.
	const insertedRow = await withTransaction(async (tx) => {
		await tx.query(
			`UPDATE meeting_participants
			 SET left_at = NOW(), updated_at = NOW()
			 WHERE user_id = :userId AND left_at IS NULL`,
			{ userId },
		);
		const insertResult = await tx.query<MeetingParticipantRow>(
			`INSERT INTO meeting_participants (user_id, meeting_id, role)
			 VALUES (:userId, :meetingId, 'watcher')
			 RETURNING *`,
			{ userId, meetingId },
		);
		return insertResult.rows[FIRST_ROW];
	});

	const participant = rowToMeetingParticipant(insertedRow);

	const {
		rows: [meetingRow],
	} = meetingResult;
	const meeting: MeetingWithPool = {
		id: meetingRow.id,
		name: meetingRow.name,
		description: meetingRow.description,
		startDate: meetingRow.start_date,
		endDate: meetingRow.end_date,
		quorumVotingPoolId: meetingRow.quorum_voting_pool_id,
		quorumPercentage: parseFloat(meetingRow.quorum_percentage),
		quorumEligibleSnapshot: meetingRow.quorum_eligible_snapshot,
		watcherPoolId: meetingRow.watcher_pool_id,
		meetingAdminPoolId: meetingRow.meeting_admin_pool_id,
		quorumCalledAt: meetingRow.quorum_called_at,
		createdAt: meetingRow.created_at,
		updatedAt: meetingRow.updated_at,
		quorumVotingPoolName: meetingRow.quorum_pool_name,
		watcherPoolName: meetingRow.watcher_pool_name,
		meetingAdminPoolName: meetingRow.meeting_admin_pool_name,
	};

	return { participant, meeting };
}

// ============================================================================
// Meeting Admin Functions
// ============================================================================

/**
 * Get meetings that a user can join as a meeting admin
 * Returns meetings where the user is in the meeting's admin_pool.
 * Meeting activity status (start/end dates) is not considered - admins
 * can join any meeting to edit it regardless of whether it's active.
 */
export async function getJoinableMeetingsForAdmin(
	userId: string,
): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT DISTINCT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.meeting_admin_pool_id = p.id
		 INNER JOIN user_pools up ON up.pool_id = m.meeting_admin_pool_id
		 WHERE up.user_id = :userId
		   AND m.meeting_admin_pool_id IS NOT NULL
		 ORDER BY m.start_date ASC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.MeetingAdmin,
	}));
}

/**
 * Get all meetings for global admins
 * Returns all meetings regardless of activity status.
 * Global admins can join any meeting to focus their UI and edit it.
 */
export async function getAllMeetingsForAdmin(): Promise<JoinableMeeting[]> {
	const result = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		pool_name: string;
	}>(
		`SELECT m.id, m.name, m.description, m.start_date, m.end_date, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 ORDER BY m.start_date ASC`,
		{},
	);

	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.start_date,
		endDate: row.end_date,
		quorumVotingPoolName: row.pool_name,
		role: ParticipantRole.MeetingAdmin,
	}));
}

/**
 * Join a meeting as a meeting admin
 * - Leaves any current meeting first
 * - Creates new participation record (no quorum counting for admins)
 * - Global admins can join any meeting (no date restrictions)
 * - Meeting admins must be in the meeting's admin pool
 */
export async function joinMeetingAsAdmin(
	userId: string,
	meetingId: number,
	isGlobalAdmin = false,
): Promise<{ participant: MeetingParticipant; meeting: MeetingWithPool }> {
	// Verify meeting exists
	// Global admins can join any meeting; meeting admins need an admin pool
	// No date filter: admins can join past/future meetings for editing
	const meetingQuery = isGlobalAdmin
		? `SELECT m.*,
		        qp.pool_name as quorum_pool_name,
		        wp.pool_name as watcher_pool_name,
		        ap.pool_name as meeting_admin_pool_name
		 FROM meetings m
		 INNER JOIN pools qp ON m.quorum_voting_pool_id = qp.id
		 LEFT JOIN pools wp ON m.watcher_pool_id = wp.id
		 LEFT JOIN pools ap ON m.meeting_admin_pool_id = ap.id
		 WHERE m.id = :meetingId`
		: `SELECT m.*,
		        qp.pool_name as quorum_pool_name,
		        wp.pool_name as watcher_pool_name,
		        ap.pool_name as meeting_admin_pool_name
		 FROM meetings m
		 INNER JOIN pools qp ON m.quorum_voting_pool_id = qp.id
		 LEFT JOIN pools wp ON m.watcher_pool_id = wp.id
		 LEFT JOIN pools ap ON m.meeting_admin_pool_id = ap.id
		 WHERE m.id = :meetingId
		   AND m.meeting_admin_pool_id IS NOT NULL`;

	const meetingResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		quorum_percentage: string;
		quorum_eligible_snapshot: number | null;
		watcher_pool_id: number | null;
		meeting_admin_pool_id: number | null;
		quorum_called_at: Date | null;
		created_at: Date;
		updated_at: Date;
		quorum_pool_name: string;
		watcher_pool_name: string | null;
		meeting_admin_pool_name: string | null;
	}>(meetingQuery, { meetingId });

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new ServiceError(
			isGlobalAdmin
				? ServiceErrorCode.MEETING_NOT_FOUND
				: ServiceErrorCode.MEETING_NOT_ACTIVE,
			isGlobalAdmin
				? "Meeting not found"
				: "Meeting not found or does not have a meeting admin pool",
		);
	}

	// Verify user is in the admin pool (skip for global admins)
	if (!isGlobalAdmin) {
		const poolCheck = await db.query<{ user_id: string }>(
			`SELECT up.user_id FROM user_pools up
			 INNER JOIN meetings m ON m.meeting_admin_pool_id = up.pool_id
			 WHERE m.id = :meetingId AND up.user_id = :userId`,
			{ meetingId, userId },
		);

		if (poolCheck.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new ServiceError(
				ServiceErrorCode.NOT_ELIGIBLE_FOR_MEETING,
				"User is not eligible to join this meeting as a meeting admin",
			);
		}
	}

	// Leave any current meeting and insert the new admin participation in a
	// single transaction so a failed INSERT rolls the leave back.
	const insertedRow = await withTransaction(async (tx) => {
		await tx.query(
			`UPDATE meeting_participants
			 SET left_at = NOW(), updated_at = NOW()
			 WHERE user_id = :userId AND left_at IS NULL`,
			{ userId },
		);
		const insertResult = await tx.query<MeetingParticipantRow>(
			`INSERT INTO meeting_participants (user_id, meeting_id, role)
			 VALUES (:userId, :meetingId, 'meeting_admin')
			 RETURNING *`,
			{ userId, meetingId },
		);
		return insertResult.rows[FIRST_ROW];
	});

	const participant = rowToMeetingParticipant(insertedRow);

	const {
		rows: [meetingRow],
	} = meetingResult;
	const meeting: MeetingWithPool = {
		id: meetingRow.id,
		name: meetingRow.name,
		description: meetingRow.description,
		startDate: meetingRow.start_date,
		endDate: meetingRow.end_date,
		quorumVotingPoolId: meetingRow.quorum_voting_pool_id,
		quorumPercentage: parseFloat(meetingRow.quorum_percentage),
		quorumEligibleSnapshot: meetingRow.quorum_eligible_snapshot,
		watcherPoolId: meetingRow.watcher_pool_id,
		meetingAdminPoolId: meetingRow.meeting_admin_pool_id,
		quorumCalledAt: meetingRow.quorum_called_at,
		createdAt: meetingRow.created_at,
		updatedAt: meetingRow.updated_at,
		quorumVotingPoolName: meetingRow.quorum_pool_name,
		watcherPoolName: meetingRow.watcher_pool_name,
		meetingAdminPoolName: meetingRow.meeting_admin_pool_name,
	};

	return { participant, meeting };
}

/**
 * Check if a user is a meeting admin for a specific meeting
 * Returns true if user is in the meeting's admin pool
 */
export async function isUserMeetingAdmin(
	userId: string,
	meetingId: number,
): Promise<boolean> {
	const result = await db.query<{ user_id: string }>(
		`SELECT up.user_id FROM user_pools up
		 INNER JOIN meetings m ON m.meeting_admin_pool_id = up.pool_id
		 WHERE m.id = :meetingId AND up.user_id = :userId`,
		{ meetingId, userId },
	);

	return result.rows.length > EMPTY_ARRAY_LENGTH;
}

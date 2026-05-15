/**
 * Quorum tracking and reporting service
 *
 * Calculates quorum statistics based on meeting participation and pool membership.
 * Users are counted toward quorum when they join a meeting as a voter,
 * before quorum has been called.
 */
import { db } from "../database/db.js";
import type {
	QuorumReport,
	QuorumActiveVoter,
} from "@mcdc-convention-voting/shared";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Numeric constants
const DECIMAL_RADIX = 10;
const PERCENTAGE_MULTIPLIER = 100;
const ZERO_COUNT = 0;

/**
 * Get quorum report for a meeting
 *
 * Calculation logic:
 * - Counts voters who have explicitly joined the meeting and were counted for quorum
 * - quorum_counted_at is set when a voter joins before quorum is called
 * - Once quorum is called, new joiners are not counted toward quorum
 * - Uses quorum_eligible_snapshot if set (quorum was called), otherwise live count
 * - Calculates votersNeededForQuorum = Math.round(totalEligible * percentage / 100)
 */
export async function getQuorumReport(
	meetingId: number,
): Promise<QuorumReport | null> {
	// Get meeting details with pool info
	const meetingResult = await db.query<{
		id: number;
		name: string;
		start_date: Date;
		end_date: Date;
		quorum_voting_pool_id: number;
		quorum_called_at: Date | null;
		quorum_percentage: string;
		quorum_eligible_snapshot: number | null;
		pool_name: string;
	}>(
		`SELECT m.id, m.name, m.start_date, m.end_date,
		        m.quorum_voting_pool_id, m.quorum_called_at,
		        m.quorum_percentage, m.quorum_eligible_snapshot,
		        p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 WHERE m.id = :meetingId`,
		{ meetingId },
	);

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [meeting],
	} = meetingResult;

	// Parse quorum percentage (stored as DECIMAL in database)
	const quorumPercentage = parseFloat(meeting.quorum_percentage);

	// Determine total eligible voters:
	// - Use snapshot if quorum was called (frozen value)
	// - Otherwise use live count from quorum pool
	const { quorum_eligible_snapshot: snapshot } = meeting;
	const isSnapshotted = snapshot !== null;

	const totalEligibleVoters = isSnapshotted
		? snapshot
		: await (async (): Promise<number> => {
				// Count only actual voters (exclude admin/watcher/meeting_admin)
				const eligibleResult = await db.query<{ count: string }>(
					`SELECT COUNT(DISTINCT up.user_id) as count
					 FROM user_pools up
					 INNER JOIN users u ON up.user_id = u.id
					 WHERE up.pool_id = :poolId
					   AND u.is_admin = FALSE
					   AND u.is_watcher = FALSE
					   AND u.is_meeting_admin = FALSE`,
					{ poolId: meeting.quorum_voting_pool_id },
				);
				return parseInt(eligibleResult.rows[FIRST_ROW].count, DECIMAL_RADIX);
			})();

	// Get count of voters who have been counted for quorum (quorum_counted_at IS NOT NULL)
	const activeResult = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT user_id) as count
		 FROM meeting_participants
		 WHERE meeting_id = :meetingId
		   AND role = 'voter'
		   AND quorum_counted_at IS NOT NULL`,
		{ meetingId },
	);
	const activeVoterCount = parseInt(
		activeResult.rows[FIRST_ROW].count,
		DECIMAL_RADIX,
	);

	// Calculate percentage of eligible voters present
	const activeVoterPercentage =
		totalEligibleVoters > ZERO_COUNT
			? (activeVoterCount / totalEligibleVoters) * PERCENTAGE_MULTIPLIER
			: ZERO_COUNT;

	// Calculate voters needed for quorum (round to nearest integer)
	const votersNeededForQuorum = Math.round(
		(totalEligibleVoters * quorumPercentage) / PERCENTAGE_MULTIPLIER,
	);

	// Determine if quorum is achieved
	const hasQuorum = activeVoterCount >= votersNeededForQuorum;

	// Calculate as of time - use quorum_called_at if set, otherwise now
	const calculatedAsOf = meeting.quorum_called_at ?? new Date();

	return {
		meetingId: meeting.id,
		meetingName: meeting.name,
		totalEligibleVoters,
		activeVoterCount,
		activeVoterPercentage,
		quorumCalledAt: meeting.quorum_called_at,
		calculatedAsOf,
		meetingStartDate: meeting.start_date,
		meetingEndDate: meeting.end_date,
		quorumPoolName: meeting.pool_name,
		quorumPercentage,
		votersNeededForQuorum,
		hasQuorum,
		isSnapshotted,
	};
}

/**
 * Call quorum for a meeting (set the quorum_called_at timestamp)
 *
 * When calling quorum (setting timestamp):
 * - Snapshots the current eligible voter count from the quorum pool
 * - This ensures quorum reports don't change if pool membership changes later
 *
 * When uncalling quorum (setting to null):
 * - Clears the snapshot so live count is used again
 *
 * @param meetingId - The meeting ID
 * @param quorumCalledAt - The timestamp when quorum was called, or null to clear
 */
export async function callQuorum(
	meetingId: number,
	quorumCalledAt: Date | null,
): Promise<void> {
	// Uncalling quorum - clear both timestamp and snapshot
	if (quorumCalledAt === null) {
		const result = await db.query(
			`UPDATE meetings
			 SET quorum_called_at = NULL,
			     quorum_eligible_snapshot = NULL,
			     updated_at = NOW()
			 WHERE id = :meetingId
			 RETURNING id`,
			{ meetingId },
		);

		if (result.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(`Meeting with ID ${String(meetingId)} not found`);
		}
		return;
	}

	// Calling quorum - snapshot the eligible voter count
	// First, get the quorum pool ID for this meeting
	const meetingResult = await db.query<{
		quorum_voting_pool_id: number;
	}>(`SELECT quorum_voting_pool_id FROM meetings WHERE id = :meetingId`, {
		meetingId,
	});

	if (meetingResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	const {
		rows: [{ quorum_voting_pool_id: poolId }],
	} = meetingResult;

	// Get current eligible voter count from the pool
	// Count only actual voters (exclude admin/watcher/meeting_admin)
	const eligibleResult = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT up.user_id) as count
		 FROM user_pools up
		 INNER JOIN users u ON up.user_id = u.id
		 WHERE up.pool_id = :poolId
		   AND u.is_admin = FALSE
		   AND u.is_watcher = FALSE
		   AND u.is_meeting_admin = FALSE`,
		{ poolId },
	);
	const eligibleSnapshot = parseInt(
		eligibleResult.rows[FIRST_ROW].count,
		DECIMAL_RADIX,
	);

	// Update meeting with both timestamp and snapshot
	const result = await db.query(
		`UPDATE meetings
		 SET quorum_called_at = :quorumCalledAt,
		     quorum_eligible_snapshot = :eligibleSnapshot,
		     updated_at = NOW()
		 WHERE id = :meetingId
		 RETURNING id`,
		{ meetingId, quorumCalledAt, eligibleSnapshot },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}
}

/**
 * Get list of active voters for quorum (for detailed view)
 *
 * Returns users who have been counted for quorum (joined the meeting as a voter
 * before quorum was called).
 */
export async function getActiveVotersForQuorum(
	meetingId: number,
): Promise<QuorumActiveVoter[]> {
	// Verify meeting exists
	const meeting = await db.query<{ id: number }>(
		`SELECT id FROM meetings WHERE id = :meetingId`,
		{ meetingId },
	);

	if (meeting.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	// Get voters who have been counted for quorum
	const result = await db.query<{
		user_id: string;
		username: string;
		first_name: string;
		last_name: string;
		quorum_counted_at: Date;
	}>(
		`SELECT
		   u.id as user_id,
		   u.username,
		   u.first_name,
		   u.last_name,
		   mp.quorum_counted_at
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
		lastActivity: row.quorum_counted_at,
	}));
}

/**
 * Quorum tracking and reporting service
 *
 * Calculates quorum statistics based on voter activity and pool membership.
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
 * - If quorum has been called: count distinct users with activity
 *   between meeting start and quorum_called_at
 * - If quorum not called: count distinct users with activity
 *   between meeting start and NOW (live count)
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
		pool_name: string;
	}>(
		`SELECT m.id, m.name, m.start_date, m.end_date,
		        m.quorum_voting_pool_id, m.quorum_called_at,
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

	// Calculate cutoff time
	const cutoffTime = meeting.quorum_called_at ?? new Date();

	// Get total eligible voters from quorum pool
	const eligibleResult = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT user_id) as count
		 FROM user_pools
		 WHERE pool_id = :poolId`,
		{ poolId: meeting.quorum_voting_pool_id },
	);
	const totalEligibleVoters = parseInt(
		eligibleResult.rows[FIRST_ROW].count,
		DECIMAL_RADIX,
	);

	// Get distinct active users from quorum pool with activity in timeframe
	const activeResult = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT al.user_id) as count
		 FROM activity_logs al
		 INNER JOIN user_pools up ON al.user_id = up.user_id
		 WHERE up.pool_id = :poolId
		   AND al.created_at >= :startDate
		   AND al.created_at <= :cutoffTime`,
		{
			poolId: meeting.quorum_voting_pool_id,
			startDate: meeting.start_date,
			cutoffTime,
		},
	);
	const activeVoterCount = parseInt(
		activeResult.rows[FIRST_ROW].count,
		DECIMAL_RADIX,
	);

	// Calculate percentage
	const activeVoterPercentage =
		totalEligibleVoters > ZERO_COUNT
			? (activeVoterCount / totalEligibleVoters) * PERCENTAGE_MULTIPLIER
			: ZERO_COUNT;

	return {
		meetingId: meeting.id,
		meetingName: meeting.name,
		totalEligibleVoters,
		activeVoterCount,
		activeVoterPercentage,
		quorumCalledAt: meeting.quorum_called_at,
		calculatedAsOf: cutoffTime,
		meetingStartDate: meeting.start_date,
		meetingEndDate: meeting.end_date,
		quorumPoolName: meeting.pool_name,
	};
}

/**
 * Call quorum for a meeting (set the quorum_called_at timestamp)
 *
 * @param meetingId - The meeting ID
 * @param quorumCalledAt - The timestamp when quorum was called, or null to clear
 */
export async function callQuorum(
	meetingId: number,
	quorumCalledAt: Date | null,
): Promise<void> {
	const result = await db.query(
		`UPDATE meetings
		 SET quorum_called_at = :quorumCalledAt, updated_at = NOW()
		 WHERE id = :meetingId
		 RETURNING id`,
		{ meetingId, quorumCalledAt },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}
}

/**
 * Get list of active voters for quorum (for detailed view)
 *
 * Returns users from the quorum pool who had activity during the meeting.
 */
export async function getActiveVotersForQuorum(
	meetingId: number,
): Promise<QuorumActiveVoter[]> {
	const meeting = await db.query<{
		quorum_voting_pool_id: number;
		start_date: Date;
		quorum_called_at: Date | null;
	}>(
		`SELECT quorum_voting_pool_id, start_date, quorum_called_at
		 FROM meetings WHERE id = :meetingId`,
		{ meetingId },
	);

	if (meeting.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Meeting with ID ${String(meetingId)} not found`);
	}

	const {
		rows: [meetingRow],
	} = meeting;
	const {
		quorum_voting_pool_id: poolId,
		start_date: startDate,
		quorum_called_at: quorumCalledAt,
	} = meetingRow;
	const cutoffTime = quorumCalledAt ?? new Date();

	const result = await db.query<{
		user_id: string;
		username: string;
		first_name: string;
		last_name: string;
		last_activity: Date;
	}>(
		`SELECT
		   u.id as user_id,
		   u.username,
		   u.first_name,
		   u.last_name,
		   MAX(al.created_at) as last_activity
		 FROM users u
		 INNER JOIN user_pools up ON u.id = up.user_id
		 INNER JOIN activity_logs al ON u.id = al.user_id
		 WHERE up.pool_id = :poolId
		   AND al.created_at >= :startDate
		   AND al.created_at <= :cutoffTime
		 GROUP BY u.id, u.username, u.first_name, u.last_name
		 ORDER BY last_activity DESC`,
		{ poolId, startDate, cutoffTime },
	);

	return result.rows.map((row) => ({
		userId: row.user_id,
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		lastActivity: row.last_activity,
	}));
}

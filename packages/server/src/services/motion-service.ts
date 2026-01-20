/**
 * Motion service for voter-facing operations
 */
import {
	MotionStatus,
	type OpenMotionForVoter,
} from "@mcdc-convention-voting/shared";
import { db } from "../database/db.js";

// Time conversion constants
const MILLISECONDS_PER_MINUTE = 60000;

/**
 * Database row type for open motions query
 */
interface OpenMotionRow {
	id: number;
	name: string;
	description: string | null;
	planned_duration: number;
	seat_count: number;
	pool_name: string;
	meeting_id: number;
	meeting_name: string;
	end_override: Date | null;
	voting_started_at: Date;
}

/**
 * Get open motions for a specific user based on their pool memberships
 *
 * Business Logic:
 * 1. Motion status must be 'voting_active'
 * 2. User must belong to the motion's voting pool (via user_pools)
 * 3. If motion has no voting_pool_id, fall back to meeting's quorum_voting_pool_id
 * 4. User must not have already voted on the motion
 *
 * Returns motions sorted by when voting started (oldest first)
 */
export async function getOpenMotionsForUser(
	userId: string,
): Promise<OpenMotionForVoter[]> {
	const result = await db.query<OpenMotionRow>(
		`SELECT
			m.id,
			m.name,
			m.description,
			m.planned_duration,
			m.seat_count,
			COALESCE(p.pool_name, qp.pool_name) as pool_name,
			mt.id as meeting_id,
			mt.name as meeting_name,
			m.end_override,
			m.voting_started_at
		 FROM motions m
		 INNER JOIN meetings mt ON m.meeting_id = mt.id
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 LEFT JOIN pools qp ON mt.quorum_voting_pool_id = qp.id
		 INNER JOIN user_pools up ON up.pool_id = COALESCE(m.voting_pool_id, mt.quorum_voting_pool_id)
		 WHERE m.status = :status
		   AND up.user_id = :userId
		   AND NOT EXISTS (
		       SELECT 1 FROM votes v
		       WHERE v.motion_id = m.id
		         AND v.user_id = :userId
		   )
		 ORDER BY m.voting_started_at ASC`,
		{ status: MotionStatus.VotingActive, userId },
	);

	return result.rows.map((row) => {
		// Calculate voting end time:
		// - Use endOverride if set
		// - Otherwise: votingStartedAt + plannedDuration minutes
		const votingEndsAt =
			row.end_override ??
			new Date(
				row.voting_started_at.getTime() +
					row.planned_duration * MILLISECONDS_PER_MINUTE,
			);

		return {
			id: row.id,
			name: row.name,
			description: row.description,
			plannedDuration: row.planned_duration,
			seatCount: row.seat_count,
			votingPoolName: row.pool_name,
			meetingId: row.meeting_id,
			meetingName: row.meeting_name,
			votingEndsAt,
			votingStartedAt: row.voting_started_at,
		};
	});
}

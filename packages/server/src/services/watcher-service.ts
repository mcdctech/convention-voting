/**
 * Watcher service for read-only report generation
 *
 * Provides data access for the watcher role's read-only reports:
 * - Meeting reports with motion summaries
 * - Quorum reports (read-only, delegates to quorum-service)
 * - Motion voter lists (who voted, not what they voted for)
 * - Motion results (final tallies for completed votes)
 */
import { MotionStatus } from "@mcdc-convention-voting/shared";
import { db } from "../database/db.js";
import { getQuorumReport, getActiveVotersForQuorum } from "./quorum-service.js";
import type {
	QuorumActiveVoter,
	QuorumReport,
	WatcherChoiceTally,
	WatcherMeetingReport,
	WatcherMotionDetail,
	WatcherMotionResult,
	WatcherMotionSummary,
	WatcherMotionVoter,
} from "@mcdc-convention-voting/shared";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const PAGE_OFFSET_ADJUSTMENT = 1;

// Number parsing
const DECIMAL_RADIX = 10;

/**
 * Get all meetings with motion summaries for watcher view
 * Watchers can see all meetings (not just active ones)
 */
export async function getWatcherMeetings(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ meetings: WatcherMeetingReport[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM meetings",
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated meetings with quorum pool names
	const meetingsResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_called_at: Date | null;
		pool_name: string;
	}>(
		`SELECT m.id, m.name, m.description, m.start_date, m.end_date,
		        m.quorum_called_at, p.pool_name
		 FROM meetings m
		 INNER JOIN pools p ON m.quorum_voting_pool_id = p.id
		 ORDER BY m.start_date DESC
		 LIMIT :limit OFFSET :offset`,
		{ limit, offset },
	);

	// For each meeting, get the motion summaries
	const meetings: WatcherMeetingReport[] = [];
	for (const meeting of meetingsResult.rows) {
		// eslint-disable-next-line no-await-in-loop -- Sequential meeting processing for related motions
		const motionSummaries = await getMotionSummariesForMeeting(meeting.id);
		meetings.push({
			meetingId: meeting.id,
			meetingName: meeting.name,
			description: meeting.description,
			startDate: meeting.start_date,
			endDate: meeting.end_date,
			quorumPoolName: meeting.pool_name,
			quorumCalledAt: meeting.quorum_called_at,
			motionSummaries,
		});
	}

	return { meetings, total };
}

/**
 * Get detailed meeting report for watcher view
 */
export async function getWatcherMeetingReport(
	meetingId: number,
): Promise<WatcherMeetingReport | null> {
	const meetingResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		start_date: Date;
		end_date: Date;
		quorum_called_at: Date | null;
		pool_name: string;
	}>(
		`SELECT m.id, m.name, m.description, m.start_date, m.end_date,
		        m.quorum_called_at, p.pool_name
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

	const motionSummaries = await getMotionSummariesForMeeting(meetingId);

	return {
		meetingId: meeting.id,
		meetingName: meeting.name,
		description: meeting.description,
		startDate: meeting.start_date,
		endDate: meeting.end_date,
		quorumPoolName: meeting.pool_name,
		quorumCalledAt: meeting.quorum_called_at,
		motionSummaries,
	};
}

/**
 * Get motion summaries for a meeting (internal helper)
 */
async function getMotionSummariesForMeeting(
	meetingId: number,
): Promise<WatcherMotionSummary[]> {
	// Get all motions for this meeting with vote counts
	const motionsResult = await db.query<{
		id: number;
		name: string;
		status: string;
		seat_count: number;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		voting_pool_name: string | null;
		total_votes: string;
		total_abstentions: string;
	}>(
		`SELECT
			m.id, m.name, m.status, m.seat_count,
			m.voting_started_at, m.voting_ended_at,
			p.pool_name as voting_pool_name,
			COALESCE(v.total_votes, 0) as total_votes,
			COALESCE(v.total_abstentions, 0) as total_abstentions
		 FROM motions m
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 LEFT JOIN LATERAL (
			SELECT
				COUNT(*) as total_votes,
				COUNT(*) FILTER (WHERE is_abstain = true) as total_abstentions
			FROM votes
			WHERE motion_id = m.id
		 ) v ON true
		 WHERE m.meeting_id = :meetingId
		 ORDER BY m.created_at ASC`,
		{ meetingId },
	);

	const summaries: WatcherMotionSummary[] = [];
	for (const motion of motionsResult.rows) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
		const status = motion.status as MotionStatus;

		// Get result if motion is completed
		let result: WatcherMotionResult | null = null;
		if (status === MotionStatus.VotingComplete) {
			// eslint-disable-next-line no-await-in-loop -- Sequential motion processing for results
			result = await getWatcherMotionResultInternal(
				motion.id,
				motion.seat_count,
			);
		}

		summaries.push({
			motionId: motion.id,
			motionName: motion.name,
			status,
			votingPoolName: motion.voting_pool_name,
			totalVotesCast: parseInt(motion.total_votes, DECIMAL_RADIX),
			totalAbstentions: parseInt(motion.total_abstentions, DECIMAL_RADIX),
			votingStartedAt: motion.voting_started_at,
			votingEndedAt: motion.voting_ended_at,
			result,
		});
	}

	return summaries;
}

/**
 * Get quorum report for watcher (read-only, delegates to quorum-service)
 */
export async function getWatcherQuorumReport(
	meetingId: number,
): Promise<QuorumReport | null> {
	// Reuse the existing quorum report logic
	return await getQuorumReport(meetingId);
}

/**
 * Get list of active voters for quorum (read-only, delegates to quorum-service)
 */
export async function getWatcherQuorumVoters(
	meetingId: number,
): Promise<QuorumActiveVoter[]> {
	// Reuse the existing quorum voters logic
	return await getActiveVotersForQuorum(meetingId);
}

/**
 * Get list of who voted on a motion (for completed votes only)
 * Privacy: Returns names and timestamps, NOT what they voted for
 */
export async function getWatcherMotionVoters(
	motionId: number,
): Promise<WatcherMotionVoter[]> {
	// Verify motion exists and is completed
	const motionResult = await db.query<{ status: string }>(
		"SELECT status FROM motions WHERE id = :motionId",
		{ motionId },
	);

	if (motionResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [{ status }],
	} = motionResult;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- Database enum returns as string
	if (status !== MotionStatus.VotingComplete) {
		throw new Error(
			"Voter list is only available for completed motions (status: voting_complete)",
		);
	}

	// Get list of users who voted (without showing what they voted for)
	const result = await db.query<{
		first_name: string;
		last_name: string;
		voted_at: Date;
	}>(
		`SELECT u.first_name, u.last_name, v.created_at as voted_at
		 FROM votes v
		 INNER JOIN users u ON v.user_id = u.id
		 WHERE v.motion_id = :motionId
		 ORDER BY u.last_name ASC, u.first_name ASC`,
		{ motionId },
	);

	return result.rows.map((row) => ({
		firstName: row.first_name,
		lastName: row.last_name,
		votedAt: row.voted_at,
	}));
}

/**
 * Get motion result for watcher (for completed votes only)
 * Shows final tallies but NOT who voted for what
 */
export async function getWatcherMotionResult(
	motionId: number,
): Promise<WatcherMotionResult> {
	// Verify motion exists and is completed
	const motionResult = await db.query<{ status: string; seat_count: number }>(
		"SELECT status, seat_count FROM motions WHERE id = :motionId",
		{ motionId },
	);

	if (motionResult.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Motion with ID ${String(motionId)} not found`);
	}

	const {
		rows: [{ status, seat_count: seatCount }],
	} = motionResult;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- Database enum returns as string
	if (status !== MotionStatus.VotingComplete) {
		throw new Error(
			"Results are only available for completed motions (status: voting_complete)",
		);
	}

	return await getWatcherMotionResultInternal(motionId, seatCount);
}

/**
 * Internal helper to get motion result (no status check)
 */
async function getWatcherMotionResultInternal(
	motionId: number,
	seatCount: number,
): Promise<WatcherMotionResult> {
	// Get vote counts per choice
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

	// Determine winners (top seat_count choices by vote count)
	const choiceTallies: WatcherChoiceTally[] = choiceResultsQuery.rows.map(
		(row, index) => ({
			choiceId: row.choice_id,
			choiceName: row.choice_name,
			voteCount: parseInt(row.vote_count, DECIMAL_RADIX),
			isWinner: index < seatCount,
		}),
	);

	return {
		seatCount,
		choiceTallies,
	};
}

/**
 * Get detailed motion information for watcher motion report page
 */
export async function getWatcherMotionDetail(
	motionId: number,
): Promise<WatcherMotionDetail | null> {
	// Get motion with meeting info
	const motionResult = await db.query<{
		id: number;
		name: string;
		description: string | null;
		status: string;
		seat_count: number;
		planned_duration: number;
		voting_started_at: Date | null;
		voting_ended_at: Date | null;
		end_override: Date | null;
		meeting_id: number;
		meeting_name: string;
		voting_pool_name: string | null;
		voting_pool_id: number | null;
	}>(
		`SELECT
			m.id, m.name, m.description, m.status, m.seat_count,
			m.planned_duration, m.voting_started_at, m.voting_ended_at,
			m.end_override, m.meeting_id,
			mt.name as meeting_name,
			p.pool_name as voting_pool_name,
			m.voting_pool_id
		 FROM motions m
		 INNER JOIN meetings mt ON m.meeting_id = mt.id
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 WHERE m.id = :motionId`,
		{ motionId },
	);

	if (motionResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [motion],
	} = motionResult;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Database enum returns as string
	const status = motion.status as MotionStatus;

	// Get vote count if voting has started
	let totalVotesCast: number | null = null;
	if (status !== MotionStatus.NotYetStarted) {
		const voteCountResult = await db.query<{ count: string }>(
			"SELECT COUNT(*) as count FROM votes WHERE motion_id = :motionId",
			{ motionId },
		);
		totalVotesCast = parseInt(
			voteCountResult.rows[FIRST_ROW].count,
			DECIMAL_RADIX,
		);
	}

	// Get eligible voter count from voting pool
	let eligibleVoterCount: number | null = null;
	if (motion.voting_pool_id !== null) {
		const eligibleResult = await db.query<{ count: string }>(
			"SELECT COUNT(*) as count FROM user_pools WHERE pool_id = :poolId",
			{ poolId: motion.voting_pool_id },
		);
		eligibleVoterCount = parseInt(
			eligibleResult.rows[FIRST_ROW].count,
			DECIMAL_RADIX,
		);
	}

	// Get result if motion is completed
	let result: WatcherMotionResult | null = null;
	if (status === MotionStatus.VotingComplete) {
		result = await getWatcherMotionResultInternal(motionId, motion.seat_count);
	}

	return {
		motionId: motion.id,
		motionName: motion.name,
		description: motion.description,
		status,
		seatCount: motion.seat_count,
		meetingId: motion.meeting_id,
		meetingName: motion.meeting_name,
		votingPoolName: motion.voting_pool_name,
		eligibleVoterCount,
		plannedDuration: motion.planned_duration,
		votingStartedAt: motion.voting_started_at,
		votingEndedAt: motion.voting_ended_at,
		endOverride: motion.end_override,
		totalVotesCast,
		result,
	};
}

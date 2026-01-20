/**
 * Vote service for voter-facing voting operations
 */
import { db } from "../database/db.js";
import type {
	CastVoteRequest,
	Choice,
	MotionForVoting,
	Vote,
	VotingEndedReason,
} from "@mcdc-convention-voting/shared";

// Time conversion constants
const MILLISECONDS_PER_MINUTE = 60000;

// Array length constants
const EMPTY_ARRAY_LENGTH = 0;
const FIRST_ROW = 0;

// Number parsing
const DECIMAL_RADIX = 10;

/**
 * Database row type for motion query
 */
interface MotionRow {
	id: number;
	name: string;
	description: string | null;
	planned_duration: number;
	seat_count: number;
	pool_name: string;
	meeting_id: number;
	meeting_name: string;
	end_override: Date | null;
	voting_started_at: Date | null;
	status: string;
}

/**
 * Database row type for choice query
 */
interface ChoiceRow {
	id: number;
	motion_id: number;
	name: string;
	sort_order: number;
	created_at: Date;
	updated_at: Date;
}

/**
 * Database row type for vote query
 */
interface VoteRow {
	id: number;
	user_id: string;
	motion_id: number;
	is_abstain: boolean;
	created_at: Date;
}

/**
 * Check if user has already voted on a motion
 */
export async function hasUserVoted(
	userId: string,
	motionId: number,
): Promise<boolean> {
	const result = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM votes
		 WHERE user_id = :userId AND motion_id = :motionId`,
		{ userId, motionId },
	);

	const count = parseInt(result.rows[FIRST_ROW].count, DECIMAL_RADIX);
	return count > EMPTY_ARRAY_LENGTH;
}

/**
 * Check if user is in the motion's voting pool
 * Uses motion's voting_pool_id, or falls back to meeting's quorum_voting_pool_id
 */
export async function isUserInVotingPool(
	userId: string,
	motionId: number,
): Promise<boolean> {
	const result = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count
		 FROM motions m
		 INNER JOIN meetings mt ON m.meeting_id = mt.id
		 INNER JOIN user_pools up ON up.pool_id = COALESCE(m.voting_pool_id, mt.quorum_voting_pool_id)
		 WHERE m.id = :motionId AND up.user_id = :userId`,
		{ userId, motionId },
	);

	const count = parseInt(result.rows[FIRST_ROW].count, DECIMAL_RADIX);
	return count > EMPTY_ARRAY_LENGTH;
}

/**
 * Get motion details for voting, including choices and vote status
 */
export async function getMotionForVoting(
	motionId: number,
	userId: string,
): Promise<MotionForVoting | null> {
	// Get motion with pool info
	const motionResult = await db.query<MotionRow>(
		`SELECT
			m.id,
			m.name,
			m.description,
			m.planned_duration,
			m.seat_count,
			m.status,
			COALESCE(p.pool_name, qp.pool_name) as pool_name,
			mt.id as meeting_id,
			mt.name as meeting_name,
			m.end_override,
			m.voting_started_at
		 FROM motions m
		 INNER JOIN meetings mt ON m.meeting_id = mt.id
		 LEFT JOIN pools p ON m.voting_pool_id = p.id
		 LEFT JOIN pools qp ON mt.quorum_voting_pool_id = qp.id
		 WHERE m.id = :motionId`,
		{ motionId },
	);

	if (motionResult.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Array destructuring is appropriate here
	const [motionRow] = motionResult.rows;

	// Get choices for this motion
	const choicesResult = await db.query<ChoiceRow>(
		`SELECT * FROM choices
		 WHERE motion_id = :motionId
		 ORDER BY sort_order ASC`,
		{ motionId },
	);

	const choices: Choice[] = choicesResult.rows.map((row) => ({
		id: row.id,
		motionId: row.motion_id,
		name: row.name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));

	// Check if user has voted
	const userHasVoted = await hasUserVoted(userId, motionId);

	// Check if user is in voting pool
	const userInPool = await isUserInVotingPool(userId, motionId);

	// Calculate voting end time using voting_started_at
	// votingStartedAt is set when motion transitions to voting_active
	// Both values are null if voting has not yet started
	const { voting_started_at: votingStartedAt } = motionRow;
	const votingEndsAt =
		motionRow.end_override ??
		(votingStartedAt === null
			? null
			: new Date(
					votingStartedAt.getTime() +
						motionRow.planned_duration * MILLISECONDS_PER_MINUTE,
				));

	// Determine if voting is still open
	const now = new Date();
	const votingTimeExpired = votingEndsAt !== null && now >= votingEndsAt;
	const isVotingActive = motionRow.status === "voting_active";

	// Determine voting eligibility and reason
	let canVote = true;
	let votingEndedReason: VotingEndedReason | undefined = undefined;

	if (userHasVoted) {
		canVote = false;
		votingEndedReason = "already_voted";
	} else if (!userInPool) {
		canVote = false;
		votingEndedReason = "not_in_pool";
	} else if (!isVotingActive) {
		canVote = false;
		votingEndedReason = "not_active";
	} else if (votingTimeExpired) {
		canVote = false;
		votingEndedReason = "voting_ended";
	}

	return {
		id: motionRow.id,
		name: motionRow.name,
		description: motionRow.description,
		plannedDuration: motionRow.planned_duration,
		seatCount: motionRow.seat_count,
		votingPoolName: motionRow.pool_name,
		meetingId: motionRow.meeting_id,
		meetingName: motionRow.meeting_name,
		votingEndsAt,
		votingStartedAt,
		choices,
		hasVoted: userHasVoted,
		canVote,
		votingEndedReason,
	};
}

/**
 * Get error message for why user cannot vote
 */
function getVotingDeniedError(reason: VotingEndedReason | undefined): string {
	switch (reason) {
		case "already_voted":
			return "You have already voted on this motion";
		case "not_in_pool":
			return "You are not eligible to vote on this motion";
		case "voting_ended":
			return "Voting has ended for this motion";
		case "not_active":
			return "This motion is not currently open for voting";
		default:
			return "You cannot vote on this motion";
	}
}

/**
 * Validate vote request choices against motion
 */
function validateVoteChoices(
	motion: MotionForVoting,
	choiceIds: number[],
	abstain: boolean,
): void {
	// Validate abstain/choice combination
	if (abstain && choiceIds.length > EMPTY_ARRAY_LENGTH) {
		throw new Error("Cannot select choices when abstaining");
	}

	if (!abstain && choiceIds.length === EMPTY_ARRAY_LENGTH) {
		throw new Error("Must select at least one choice or abstain");
	}

	// Validate choice count against seat count
	if (!abstain && choiceIds.length > motion.seatCount) {
		throw new Error(
			`You can only select up to ${String(motion.seatCount)} choice(s)`,
		);
	}

	// Validate all choice IDs belong to this motion
	if (!abstain) {
		const validChoiceIds = new Set(motion.choices.map((c) => c.id));
		for (const choiceId of choiceIds) {
			if (!validChoiceIds.has(choiceId)) {
				throw new Error("Invalid choice selection");
			}
		}
	}
}

/**
 * Cast a vote on a motion
 *
 * Validates:
 * 1. Motion exists and is voting_active
 * 2. User hasn't already voted
 * 3. User is in the voting pool
 * 4. Voting time hasn't expired
 * 5. Choice count doesn't exceed seat_count (unless abstaining)
 * 6. All choice IDs belong to this motion
 */
export async function castVote(
	userId: string,
	motionId: number,
	request: CastVoteRequest,
): Promise<Vote> {
	const { choiceIds, abstain } = request;

	// Get motion details to validate
	const motion = await getMotionForVoting(motionId, userId);

	if (motion === null) {
		throw new Error("Motion not found");
	}

	// Check if user can vote
	if (!motion.canVote) {
		throw new Error(getVotingDeniedError(motion.votingEndedReason));
	}

	// Validate choices
	validateVoteChoices(motion, choiceIds, abstain);

	// Insert vote record
	const voteResult = await db.query<VoteRow>(
		`INSERT INTO votes (user_id, motion_id, is_abstain)
		 VALUES (:userId, :motionId, :isAbstain)
		 RETURNING *`,
		{ userId, motionId, isAbstain: abstain },
	);

	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Array destructuring is appropriate here
	const [voteRow] = voteResult.rows;

	// Insert vote choices if not abstaining
	if (!abstain && choiceIds.length > EMPTY_ARRAY_LENGTH) {
		for (const choiceId of choiceIds) {
			// eslint-disable-next-line no-await-in-loop -- Sequential inserts required for vote choices
			await db.query(
				`INSERT INTO vote_choices (vote_id, choice_id)
				 VALUES (:voteId, :choiceId)`,
				{ voteId: voteRow.id, choiceId },
			);
		}
	}

	return {
		id: voteRow.id,
		userId: voteRow.user_id,
		motionId: voteRow.motion_id,
		isAbstain: voteRow.is_abstain,
		createdAt: voteRow.created_at,
	};
}

/**
 * Get user's vote for a motion (if exists)
 */
export async function getUserVote(
	userId: string,
	motionId: number,
): Promise<Vote | null> {
	const result = await db.query<VoteRow>(
		`SELECT * FROM votes
		 WHERE user_id = :userId AND motion_id = :motionId`,
		{ userId, motionId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Array destructuring is appropriate here
	const [row] = result.rows;
	return {
		id: row.id,
		userId: row.user_id,
		motionId: row.motion_id,
		isAbstain: row.is_abstain,
		createdAt: row.created_at,
	};
}

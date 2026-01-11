/**
 * Shared types and interfaces for the MCDC Convention Voting System
 */

/**
 * Base user interface (public-facing, never includes password)
 *
 * Database schema (users table):
 * - id: UUID PRIMARY KEY
 * - username: VARCHAR(255) NOT NULL UNIQUE
 * - password_hash: VARCHAR(255) (nullable, never exposed in this type)
 * - voter_id: VARCHAR(255) UNIQUE (nullable)
 * - first_name: VARCHAR(255) NOT NULL
 * - last_name: VARCHAR(255) NOT NULL
 * - is_admin: BOOLEAN NOT NULL DEFAULT FALSE
 * - is_disabled: BOOLEAN NOT NULL DEFAULT FALSE
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * Note: poolNames is computed from user_pools join, not stored in database
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface User {
	id: string;
	username: string;
	voterId: string | null;
	firstName: string;
	lastName: string;
	isAdmin: boolean;
	isDisabled: boolean;
	createdAt: Date;
	updatedAt: Date;
	poolNames?: string[]; // Optional: pool names user belongs to
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
	page: number;
	limit: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

/**
 * User Management Types
 */

/**
 * CSV row format for bulk user upload
 */
export interface UserCSVRow {
	voter_id: string;
	first_name: string;
	last_name: string;
	pool_key_1?: string;
	pool_key_2?: string;
	pool_key_3?: string;
	pool_key_4?: string;
	pool_key_5?: string;
	pool_key_6?: string;
	pool_key_7?: string;
	pool_key_8?: string;
	pool_key_9?: string;
	pool_key_10?: string;
}

/**
 * Request to create a single user
 */
export interface CreateUserRequest {
	voterId: string;
	firstName: string;
	lastName: string;
	username?: string; // Optional, will be auto-generated if not provided
	poolKeys?: string[]; // Optional pool keys to associate with user
}

/**
 * Request to update user details
 */
export interface UpdateUserRequest {
	voterId?: string;
	firstName?: string;
	lastName?: string;
	username?: string;
	poolKeys?: string[]; // Optional pool keys to associate with user
}

/**
 * Result of bulk password generation
 */
export interface PasswordGenerationResult {
	username: string;
	password: string;
	voterId: string;
}

/**
 * Response from bulk password generation operation
 */
export interface BulkPasswordResponse {
	results: PasswordGenerationResult[];
	count: number;
}

/**
 * Response from password reset operation
 */
export interface PasswordResetResponse {
	username: string;
	password: string;
}

/**
 * System settings
 */
export interface SystemSettings {
	nonAdminLoginEnabled: boolean;
}

/**
 * User list response with pagination
 */
export type UserListResponse = PaginatedResponse<User>;

/**
 * Pool Management Types
 */

/**
 * Base pool interface
 *
 * Database schema (pools table):
 * - id: SERIAL PRIMARY KEY
 * - pool_key: VARCHAR(255) NOT NULL UNIQUE
 * - pool_name: VARCHAR(255) NOT NULL
 * - description: TEXT (nullable)
 * - is_disabled: BOOLEAN NOT NULL DEFAULT FALSE
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * Note: userCount is computed from user_pools join, not stored in database
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface Pool {
	id: number;
	poolKey: string;
	poolName: string;
	description: string | null;
	isDisabled: boolean;
	createdAt: Date;
	updatedAt: Date;
	userCount?: number; // Optional: computed from user_pools join
}

/**
 * CSV row format for bulk pool upload
 */
export interface PoolCSVRow {
	pool_key: string;
	pool_name: string;
	description?: string;
}

/**
 * Request to create a single pool
 */
export interface CreatePoolRequest {
	poolKey: string;
	poolName: string;
	description?: string;
}

/**
 * Request to update pool details
 */
export interface UpdatePoolRequest {
	poolKey?: string;
	poolName?: string;
	description?: string;
}

/**
 * Pool list response with pagination
 */
export type PoolListResponse = PaginatedResponse<Pool>;

/**
 * Meeting Management Types
 */

/**
 * Motion status enum
 * Status can only advance forward: not_yet_started -> voting_active -> voting_complete
 *
 * Database enum (motion_status):
 * - 'not_yet_started': Voting has not begun (default)
 * - 'voting_active': Voting is currently in progress
 * - 'voting_complete': Voting has ended
 *
 * IMPORTANT: Keep this enum in sync with database migrations
 */
export enum MotionStatus {
	NotYetStarted = "not_yet_started",
	VotingActive = "voting_active",
	VotingComplete = "voting_complete",
}

/**
 * Meeting interface
 *
 * Database schema (meetings table):
 * - id: SERIAL PRIMARY KEY
 * - name: VARCHAR(255) NOT NULL
 * - description: TEXT (nullable)
 * - start_date: TIMESTAMP WITH TIME ZONE NOT NULL
 * - end_date: TIMESTAMP WITH TIME ZONE NOT NULL
 * - quorum_voting_pool_id: INTEGER NOT NULL REFERENCES pools(id) ON DELETE RESTRICT
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface Meeting {
	id: number;
	name: string;
	description: string | null;
	startDate: Date;
	endDate: Date;
	quorumVotingPoolId: number;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Meeting with related pool data for display
 */
export interface MeetingWithPool extends Meeting {
	quorumVotingPoolName: string;
}

/**
 * Motion interface
 *
 * Database schema (motions table):
 * - id: SERIAL PRIMARY KEY
 * - meeting_id: INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE
 * - name: VARCHAR(255) NOT NULL
 * - description: TEXT (nullable)
 * - planned_duration: INTEGER NOT NULL (minutes)
 * - seat_count: INTEGER NOT NULL DEFAULT 1
 * - voting_pool_id: INTEGER REFERENCES pools(id) ON DELETE RESTRICT (nullable)
 * - status: motion_status NOT NULL DEFAULT 'not_yet_started'
 * - end_override: TIMESTAMP WITH TIME ZONE (nullable, only when status='voting_active')
 * - voting_started_at: TIMESTAMP WITH TIME ZONE (nullable, set when status changes to 'voting_active')
 * - voting_ended_at: TIMESTAMP WITH TIME ZONE (nullable, set when status changes to 'voting_complete')
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface Motion {
	id: number;
	meetingId: number;
	name: string;
	description: string | null;
	plannedDuration: number;
	seatCount: number;
	votingPoolId: number | null;
	status: MotionStatus;
	endOverride: Date | null;
	votingStartedAt: Date | null;
	votingEndedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Motion with related pool data for display
 */
export interface MotionWithPool extends Motion {
	votingPoolName: string | null;
}

/**
 * Choice interface
 *
 * Database schema (choices table):
 * - id: SERIAL PRIMARY KEY
 * - motion_id: INTEGER NOT NULL REFERENCES motions(id) ON DELETE CASCADE
 * - name: VARCHAR(255) NOT NULL
 * - sort_order: INTEGER NOT NULL DEFAULT 0
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface Choice {
	id: number;
	motionId: number;
	name: string;
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Request to create a meeting
 */
export interface CreateMeetingRequest {
	name: string;
	description?: string;
	startDate: string; // ISO 8601 string
	endDate: string; // ISO 8601 string
	quorumVotingPoolId: number;
}

/**
 * Request to update a meeting
 */
export interface UpdateMeetingRequest {
	name?: string;
	description?: string;
	startDate?: string; // ISO 8601 string
	endDate?: string; // ISO 8601 string
	quorumVotingPoolId?: number;
}

/**
 * Request to create a motion
 */
export interface CreateMotionRequest {
	meetingId: number;
	name: string;
	description?: string;
	plannedDuration: number;
	seatCount?: number; // Defaults to 1
	votingPoolId?: number;
}

/**
 * Request to update a motion (non-status fields)
 */
export interface UpdateMotionRequest {
	name?: string;
	description?: string;
	plannedDuration?: number;
	seatCount?: number;
	votingPoolId?: number;
}

/**
 * Request to update motion status (forward only)
 */
export interface UpdateMotionStatusRequest {
	status: MotionStatus;
	endOverride?: string; // ISO 8601 string, only valid when status='voting_active'
}

/**
 * Request to create a choice
 */
export interface CreateChoiceRequest {
	motionId: number;
	name: string;
	sortOrder?: number;
}

/**
 * Request to update a choice
 */
export interface UpdateChoiceRequest {
	name?: string;
	sortOrder?: number;
}

/**
 * Request to reorder choices (batch operation)
 */
export interface ReorderChoicesRequest {
	choiceIds: number[]; // Ordered array of choice IDs
}

/**
 * Meeting list response with pagination
 */
export type MeetingListResponse = PaginatedResponse<MeetingWithPool>;

/**
 * Motion list response with pagination
 */
export type MotionListResponse = PaginatedResponse<MotionWithPool>;

/**
 * Choice list response (non-paginated, always return all for a motion)
 */
export interface ChoiceListResponse {
	data: Choice[];
}

/**
 * Vote statistics for a motion (admin view)
 *
 * Provides aggregate vote counts without revealing individual vote content.
 * Used for live vote tracking during active voting sessions.
 *
 * Privacy: Only shows total ballot count. No information about vote content,
 * choices, abstentions, or undervotes is exposed.
 */
export interface MotionVoteStats {
	motionId: number;
	totalVotes: number; // Total voters who cast a ballot (any type)
	eligibleVoters: number; // Total users in voting pool
	participationRate: number; // (totalVotes / eligibleVoters) * 100
	lastUpdated: Date; // Timestamp of calculation
}

/**
 * Response for vote statistics endpoint
 */
export interface MotionVoteStatsResponse {
	data: MotionVoteStats;
}

/**
 * Detailed results for a single choice in a completed motion
 *
 * Represents aggregated vote counts for one choice option.
 * Used for displaying final results after voting ends.
 */
export interface ChoiceResult {
	choiceId: number;
	choiceName: string;
	voteCount: number; // Number of votes for this choice
	percentage: number; // Percentage of total votes cast (excluding abstentions)
	isWinner: boolean; // True if this choice won (top seat_count choices)
}

/**
 * Detailed voting results for a completed motion
 *
 * Provides comprehensive results breakdown including vote counts per choice,
 * abstentions, and participation rate. Only available after voting ends.
 *
 * Privacy: Only available when motion status is voting_complete.
 * Results are aggregated by choice. No individual voter information exposed.
 */
export interface MotionDetailedResults {
	motionId: number;
	motionName: string;
	seatCount: number; // Number of seats/winners
	totalVotesIncludingAbstentions: number; // Total ballots cast
	totalVotesForChoices: number; // Votes cast for choices (excluding abstentions)
	abstentionCount: number; // Number of abstentions
	abstentionPercentage: number; // Percentage of total votes that abstained
	eligibleVoters: number; // Total users in voting pool
	participationRate: number; // (totalVotes / eligibleVoters) * 100
	choiceResults: ChoiceResult[]; // Results per choice, sorted by vote count descending
	hasQuorum: boolean; // True if participation meets quorum (future enhancement)
}

/**
 * Response for detailed results endpoint
 */
export interface MotionDetailedResultsResponse {
	data: MotionDetailedResults;
}

/**
 * Authentication Types
 */

/**
 * Login request payload
 */
export interface LoginRequest {
	username: string;
	password: string;
}

/**
 * Authenticated user (subset of User for auth purposes)
 */
export interface AuthUser {
	id: string;
	username: string;
	firstName: string;
	lastName: string;
	isAdmin: boolean;
}

/**
 * Login response with JWT token
 */
export interface LoginResponse {
	token: string;
	user: AuthUser;
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
	sub: string; // User ID
	username: string;
	isAdmin: boolean;
	iat: number;
	exp: number;
}

/**
 * Login error codes for specific failure states
 */
export enum LoginErrorCode {
	InvalidCredentials = "INVALID_CREDENTIALS",
	AccountDisabled = "ACCOUNT_DISABLED",
	NoPasswordSet = "NO_PASSWORD_SET",
	LoginDisabled = "LOGIN_DISABLED",
}

/**
 * Voter-Facing Types
 */

/**
 * Open motion for voter view
 * Includes meeting context and computed end time information
 *
 * This type is returned by the voter API, not directly mapped to a database table.
 * It joins data from:
 * - motions table (id, name, description, planned_duration, seat_count, updated_at, end_override)
 * - meetings table (meeting_id, meeting_name)
 * - pools table (voting_pool_name via motion's voting_pool_id or meeting's quorum_voting_pool_id)
 *
 * votingEndsAt is computed as:
 * - endOverride if set
 * - Otherwise: updatedAt + plannedDuration minutes
 */
export interface OpenMotionForVoter {
	id: number;
	name: string;
	description: string | null;
	plannedDuration: number;
	seatCount: number;
	votingPoolName: string;
	meetingId: number;
	meetingName: string;
	votingEndsAt: Date;
	votingStartedAt: Date;
}

/**
 * Response for open motions list (non-paginated since active motions will be few)
 */
export interface OpenMotionsResponse {
	data: OpenMotionForVoter[];
}

/**
 * Voting Types
 */

/**
 * Vote interface
 *
 * Database schema (votes table):
 * - id: SERIAL PRIMARY KEY
 * - user_id: UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
 * - motion_id: INTEGER NOT NULL REFERENCES motions(id) ON DELETE CASCADE
 * - is_abstain: BOOLEAN NOT NULL DEFAULT FALSE
 * - created_at: TIMESTAMP WITH TIME ZONE
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface Vote {
	id: number;
	userId: string;
	motionId: number;
	isAbstain: boolean;
	createdAt: Date;
}

/**
 * Request to cast a vote
 */
export interface CastVoteRequest {
	choiceIds: number[];
	abstain: boolean;
}

/**
 * Reason why voting is not allowed
 */
export type VotingEndedReason =
	| "already_voted"
	| "not_in_pool"
	| "voting_ended"
	| "not_active";

/**
 * Motion details for voter view (includes choices and vote status)
 * Extends OpenMotionForVoter with voting-specific information
 */
export interface MotionForVoting extends OpenMotionForVoter {
	choices: Choice[];
	hasVoted: boolean;
	canVote: boolean;
	votingEndedReason?: VotingEndedReason;
}

/**
 * Response for casting a vote
 */
export interface CastVoteResponse {
	vote: Vote;
}

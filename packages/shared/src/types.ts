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
 * - is_watcher: BOOLEAN NOT NULL DEFAULT FALSE
 * - is_disabled: BOOLEAN NOT NULL DEFAULT FALSE
 * - created_at: TIMESTAMP WITH TIME ZONE
 * - updated_at: TIMESTAMP WITH TIME ZONE
 *
 * Role exclusivity: A user can only be admin, watcher, or voter (neither flag set).
 * Database constraint prevents is_admin=TRUE AND is_watcher=TRUE.
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
	isWatcher: boolean;
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
 * User type/role values
 * Represents the exclusive role a user can have in the system
 */
export type UserType = "voter" | "admin" | "watcher";

/**
 * CSV row format for bulk user upload
 */
export interface UserCSVRow {
	voter_id: string;
	first_name: string;
	last_name: string;
	user_type?: string; // Optional: 'voter' (default), 'admin', or 'watcher'
	is_enabled: string; // Required: 'true', '1', 'false', or '0'
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
	isAdmin?: boolean; // Optional, defaults to false
	isWatcher?: boolean; // Optional, defaults to false
	isDisabled?: boolean; // Optional, defaults to false
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
 * Request for bulk password generation with optional filters
 */
export interface GeneratePasswordsRequest {
	poolId?: number; // Only generate for users in this pool
	onlyNullPasswords?: boolean; // Only generate for users without existing passwords
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
 * CSV import result
 */
export interface CSVImportResult {
	success: number;
	failed: number;
	errors: Array<{ row: number; voterId: string; error: string }>;
	warnings?: Array<{ voterId: string; warning: string }>;
}

/**
 * CSV import phases for progress tracking
 */
export type CSVImportPhase =
	| "parsing"
	| "validating"
	| "importing"
	| "complete";

/**
 * CSV import progress update (sent via SSE)
 */
export interface CSVImportProgress {
	phase: CSVImportPhase;
	current: number;
	total: number;
	message: string;
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
 * Pending Pool Key Types
 * Used for tracking invalid pool keys from CSV imports
 */

/**
 * Pending pool key summary for admin view
 * Represents a pool key that was used in CSV import but doesn't exist
 *
 * Database schema (pending_pool_keys table):
 * - id: SERIAL PRIMARY KEY
 * - pool_key: VARCHAR(255) NOT NULL
 * - user_id: UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
 * - created_at: TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 * - UNIQUE (user_id, pool_key)
 *
 * This interface represents aggregated data from the table.
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface PendingPoolKey {
	poolKey: string;
	userCount: number;
	firstSeenAt: Date;
}

/**
 * Request to resolve pending pool keys by creating a new pool
 */
export interface ResolvePendingPoolCreateRequest {
	poolKey: string;
	poolName: string;
	description?: string;
}

/**
 * Request to resolve pending pool keys by remapping users to existing pool
 */
export interface ResolvePendingPoolRemapRequest {
	pendingPoolKey: string;
	targetPoolId: number;
}

/**
 * Response from resolve pending pool operation
 */
export interface ResolvePendingPoolResponse {
	usersUpdated: number;
	pool: Pool;
}

/**
 * Paginated response for pending pool keys
 */
export type PendingPoolKeyListResponse = PaginatedResponse<PendingPoolKey>;

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
 * - quorum_called_at: TIMESTAMP WITH TIME ZONE (nullable)
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
	quorumCalledAt: Date | null;
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
	isWatcher: boolean;
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
	isWatcher: boolean;
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
 * - motions table (id, name, description, planned_duration, seat_count, voting_started_at, end_override)
 * - meetings table (meeting_id, meeting_name)
 * - pools table (voting_pool_name via motion's voting_pool_id or meeting's quorum_voting_pool_id)
 *
 * votingEndsAt is computed as:
 * - endOverride if set
 * - Otherwise: votingStartedAt + plannedDuration minutes
 *
 * votingStartedAt is set when the motion transitions to voting_active status.
 * It is null if voting has not yet started.
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
	votingEndsAt: Date | null;
	votingStartedAt: Date | null;
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

/**
 * Quorum Tracking Types
 */

/**
 * Activity log entry for quorum tracking
 *
 * Database schema (activity_logs table):
 * - id: SERIAL PRIMARY KEY
 * - user_id: UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
 * - url_path: VARCHAR(500) NOT NULL
 * - created_at: TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 *
 * Note: No meeting_id - activity is associated with meetings via query-time joins
 * based on user IDs and timestamps.
 *
 * IMPORTANT: Keep this type in sync with database migrations
 */
export interface ActivityLog {
	id: number;
	userId: string;
	urlPath: string;
	createdAt: Date;
}

/**
 * Quorum report for a meeting
 *
 * Provides aggregate statistics about voter presence at a meeting
 * based on API activity during the meeting time window.
 */
export interface QuorumReport {
	meetingId: number;
	meetingName: string;
	totalEligibleVoters: number;
	activeVoterCount: number;
	activeVoterPercentage: number;
	quorumCalledAt: Date | null;
	calculatedAsOf: Date;
	meetingStartDate: Date;
	meetingEndDate: Date;
	quorumPoolName: string;
}

/**
 * Active voter entry for detailed quorum view
 */
export interface QuorumActiveVoter {
	userId: string;
	username: string;
	firstName: string;
	lastName: string;
	lastActivity: Date;
}

/**
 * Request to call/uncall quorum
 */
export interface CallQuorumRequest {
	quorumCalledAt: string | null; // ISO 8601 string, null to clear
}

/**
 * Response for quorum report endpoint
 */
export interface QuorumReportResponse {
	data: QuorumReport;
}

/**
 * Response for active voters endpoint
 */
export interface QuorumActiveVotersResponse {
	data: QuorumActiveVoter[];
}

/**
 * Watcher Types
 * These types are used for the watcher role's read-only reports
 */

/**
 * Choice tally for watcher motion results
 */
export interface WatcherChoiceTally {
	choiceId: number;
	choiceName: string;
	voteCount: number;
	isWinner: boolean;
}

/**
 * Motion result for watcher (completed votes only)
 * Shows tallies but NOT who voted for what
 */
export interface WatcherMotionResult {
	seatCount: number;
	choiceTallies: WatcherChoiceTally[];
}

/**
 * Voter entry in watcher's motion voter list
 * Shows WHO voted, but NOT what they voted for
 */
export interface WatcherMotionVoter {
	firstName: string;
	lastName: string;
	votedAt: Date;
}

/**
 * Motion summary for watcher meeting report
 */
export interface WatcherMotionSummary {
	motionId: number;
	motionName: string;
	status: MotionStatus;
	votingPoolName: string | null;
	totalVotesCast: number;
	totalAbstentions: number;
	votingStartedAt: Date | null;
	votingEndedAt: Date | null;
	result: WatcherMotionResult | null; // Only populated for completed motions
}

/**
 * Watcher's view of a meeting report
 * Shows all meetings with motion summaries
 */
export interface WatcherMeetingReport {
	meetingId: number;
	meetingName: string;
	description: string | null;
	startDate: Date;
	endDate: Date;
	quorumPoolName: string;
	quorumCalledAt: Date | null;
	motionSummaries: WatcherMotionSummary[];
}

/**
 * Response for watcher meetings list
 */
export type WatcherMeetingsResponse = PaginatedResponse<WatcherMeetingReport>;

/**
 * Response for watcher motion voters endpoint
 */
export interface WatcherMotionVotersResponse {
	data: WatcherMotionVoter[];
}

/**
 * Response for watcher motion result endpoint
 */
export interface WatcherMotionResultResponse {
	data: WatcherMotionResult;
}

/**
 * Detailed motion information for watcher motion report page
 * Shows different information based on motion status
 */
export interface WatcherMotionDetail {
	motionId: number;
	motionName: string;
	description: string | null;
	status: MotionStatus;
	seatCount: number;
	// Meeting info for navigation
	meetingId: number;
	meetingName: string;
	// Voting pool
	votingPoolName: string | null;
	eligibleVoterCount: number | null;
	// Voting times
	plannedDuration: number;
	votingStartedAt: Date | null;
	votingEndedAt: Date | null;
	endOverride: Date | null;
	// Vote counts (null if not yet started)
	totalVotesCast: number | null;
	totalAbstentions: number | null;
	// Results (only for completed motions)
	result: WatcherMotionResult | null;
}

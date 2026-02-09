/**
 * API service for communicating with the backend
 */
import type {
	User,
	CreateUserRequest,
	BulkPasswordResponse,
	PasswordGenerationResult,
	GeneratePasswordsRequest,
	Pool,
	CreatePoolRequest,
	UpdatePoolRequest,
	MeetingWithPool,
	CreateMeetingRequest,
	UpdateMeetingRequest,
	MotionDetailedResults,
	MotionVoteStats,
	MotionWithPool,
	CreateMotionRequest,
	UpdateMotionRequest,
	UpdateMotionStatusRequest,
	Choice,
	CreateChoiceRequest,
	UpdateChoiceRequest,
	LoginRequest,
	LoginResponse,
	AuthUser,
	OpenMotionsResponse,
	MotionForVoting,
	CastVoteRequest,
	CastVoteResponse,
	QuorumReport,
	QuorumActiveVoter,
	WatcherMeetingReport,
	WatcherMotionDetail,
	WatcherMotionVoter,
	WatcherMotionResult,
} from "@mcdc-convention-voting/shared";

// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_LIMIT = 50;
const AUTH_TOKEN_KEY = "auth_token";

// Type guard for import.meta.env
function getApiBaseUrl(): string {
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring, @typescript-eslint/no-unsafe-assignment -- import.meta.env is typed as any in Vite
	const viteApiUrl = import.meta.env.VITE_API_URL;
	if (typeof viteApiUrl === "string" && viteApiUrl !== "") {
		return viteApiUrl;
	}
	// Empty string = relative URLs (same origin deployment)
	return "";
}

function getApiPrefix(): string {
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring, @typescript-eslint/no-unsafe-assignment -- import.meta.env is typed as any in Vite
	const viteApiPrefix = import.meta.env.VITE_API_PREFIX;
	if (typeof viteApiPrefix === "string") {
		return viteApiPrefix;
	}
	// Empty string = no prefix (default)
	return "";
}

const API_BASE_URL = getApiBaseUrl();
const API_PREFIX = getApiPrefix();

/**
 * Authentication Token Management
 */

/**
 * Get stored auth token
 */
export function getAuthToken(): string | null {
	return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Store auth token
 */
export function setAuthToken(token: string): void {
	localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Clear stored auth token
 */
export function clearAuthToken(): void {
	localStorage.removeItem(AUTH_TOKEN_KEY);
}

interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

interface PaginatedResponse<T> {
	data: T[];
	pagination: Pagination;
}

export interface ApiResponse<T> {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
}

interface CSVImportResult {
	success: number;
	failed: number;
	errors: Array<{
		row: number;
		voterId: string;
		error: string;
	}>;
}

export interface SystemSettings {
	nonAdminLoginEnabled: boolean;
}

interface ErrorResponse {
	message?: string;
	error?: string;
}

/**
 * Type guard to check if value is an error response
 */
function isErrorResponse(value: unknown): value is ErrorResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		(("message" in value && typeof value.message === "string") ||
			("error" in value && typeof value.error === "string"))
	);
}

/**
 * Parse JSON response with trusted type
 * Note: This trusts the API to return the correct shape
 */
async function parseJsonResponse<T>(response: Response): Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- API client intentionally trusts backend to return correct type
	return (await response.json()) as T;
}

/**
 * Make an API request
 */
async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const url = `${API_BASE_URL}${endpoint}`;

	// Build headers, merging with any provided headers
	const requestHeaders = new Headers(options.headers);
	if (!requestHeaders.has("Content-Type")) {
		requestHeaders.set("Content-Type", "application/json");
	}

	// Add auth header if token exists
	const token = getAuthToken();
	if (token !== null && !requestHeaders.has("Authorization")) {
		requestHeaders.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		...options,
		headers: requestHeaders,
	});

	if (!response.ok) {
		const errorJson: unknown = await response.json().catch(() => ({
			message: response.statusText,
		}));
		const errorData: ErrorResponse = isErrorResponse(errorJson)
			? errorJson
			: { message: response.statusText };
		const errorMessage =
			errorData.error ?? errorData.message ?? `HTTP ${response.status}`;
		throw new Error(errorMessage);
	}

	return await parseJsonResponse<T>(response);
}

/**
 * Upload users from CSV file
 */
export async function uploadUsersCSV(
	file: File,
): Promise<ApiResponse<CSVImportResult>> {
	const formData = new FormData();
	formData.append("file", file);

	const url = `${API_BASE_URL}${API_PREFIX}/admin/users/upload`;

	// Build headers with auth token (don't set Content-Type for FormData)
	const requestHeaders = new Headers();
	const token = getAuthToken();
	if (token !== null) {
		requestHeaders.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(url, {
		method: "POST",
		headers: requestHeaders,
		body: formData,
	});

	if (!response.ok) {
		const errorJson: unknown = await response.json().catch(() => ({
			message: response.statusText,
		}));
		const errorData: ErrorResponse = isErrorResponse(errorJson)
			? errorJson
			: { message: response.statusText };
		const errorMessage =
			errorData.error ?? errorData.message ?? `HTTP ${response.status}`;
		throw new Error(errorMessage);
	}

	return await parseJsonResponse<ApiResponse<CSVImportResult>>(response);
}

/**
 * Get paginated list of users with optional search and pool filter
 */
export async function getUsers(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
	search?: string,
	poolId?: number,
): Promise<PaginatedResponse<User>> {
	const params = new URLSearchParams({
		page: String(page),
		limit: String(limit),
	});
	if (search !== undefined && search.trim() !== "") {
		params.set("search", search.trim());
	}
	if (poolId !== undefined) {
		params.set("poolId", String(poolId));
	}
	return await apiRequest<PaginatedResponse<User>>(
		`${API_PREFIX}/admin/users?${params.toString()}`,
	);
}

/**
 * Get a single user by ID
 */
export async function getUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(`${API_PREFIX}/admin/users/${id}`);
}

/**
 * Create a new user
 */
export async function createUser(
	userData: CreateUserRequest,
): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(`${API_PREFIX}/admin/users`, {
		method: "POST",
		body: JSON.stringify(userData),
	});
}

/**
 * Update an existing user
 */
export async function updateUser(
	id: string,
	userData: Partial<CreateUserRequest>,
): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(
		`${API_PREFIX}/admin/users/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(userData),
		},
	);
}

/**
 * Disable a user
 */
export async function disableUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(
		`${API_PREFIX}/admin/users/${id}/disable`,
		{
			method: "POST",
		},
	);
}

/**
 * Enable a user
 */
export async function enableUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(
		`${API_PREFIX}/admin/users/${id}/enable`,
		{
			method: "POST",
		},
	);
}

/**
 * Generate passwords for users with optional filtering
 * @param options - Optional filters (poolId, onlyNullPasswords)
 */
export async function generatePasswords(
	options?: GeneratePasswordsRequest,
): Promise<ApiResponse<BulkPasswordResponse>> {
	return await apiRequest<ApiResponse<BulkPasswordResponse>>(
		`${API_PREFIX}/admin/users/generate-passwords`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(options ?? {}),
		},
	);
}

/**
 * Reset password for a specific user
 */
export async function resetUserPassword(
	id: string,
): Promise<ApiResponse<PasswordGenerationResult>> {
	return await apiRequest<ApiResponse<PasswordGenerationResult>>(
		`${API_PREFIX}/admin/users/${id}/reset-password`,
		{
			method: "POST",
		},
	);
}

/**
 * Get system settings
 */
export async function getSystemSettings(): Promise<
	ApiResponse<SystemSettings>
> {
	return await apiRequest<ApiResponse<SystemSettings>>(
		`${API_PREFIX}/admin/settings`,
	);
}

/**
 * Update login enabled setting
 */
export async function updateLoginEnabled(
	enabled: boolean,
): Promise<ApiResponse<SystemSettings>> {
	return await apiRequest<ApiResponse<SystemSettings>>(
		`${API_PREFIX}/admin/settings/login-enabled`,
		{
			method: "PUT",
			body: JSON.stringify({ enabled }),
		},
	);
}

/**
 * Pool Management API Functions
 */

/**
 * Upload pools from CSV file
 */
export async function uploadPoolsCSV(
	file: File,
): Promise<ApiResponse<CSVImportResult>> {
	const formData = new FormData();
	formData.append("file", file);

	// Build headers with auth token (don't set Content-Type for FormData)
	const requestHeaders = new Headers();
	const token = getAuthToken();
	if (token !== null) {
		requestHeaders.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(
		`${API_BASE_URL}${API_PREFIX}/admin/pools/upload`,
		{
			method: "POST",
			headers: requestHeaders,
			body: formData,
		},
	);

	if (!response.ok) {
		const errorJson: unknown = await response.json().catch(() => ({
			message: response.statusText,
		}));
		const errorData: ErrorResponse = isErrorResponse(errorJson)
			? errorJson
			: { message: response.statusText };
		const errorMessage =
			errorData.error ?? errorData.message ?? `HTTP ${response.status}`;
		throw new Error(errorMessage);
	}

	return await parseJsonResponse<ApiResponse<CSVImportResult>>(response);
}

/**
 * Get paginated list of pools
 */
export async function getPools(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<Pool>> {
	return await apiRequest<PaginatedResponse<Pool>>(
		`${API_PREFIX}/admin/pools?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single pool by ID
 */
export async function getPool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(`${API_PREFIX}/admin/pools/${id}`);
}

/**
 * Create a new pool
 */
export async function createPool(
	pool: CreatePoolRequest,
): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(`${API_PREFIX}/admin/pools`, {
		method: "POST",
		body: JSON.stringify(pool),
	});
}

/**
 * Update a pool
 */
export async function updatePool(
	id: number,
	updates: UpdatePoolRequest,
): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(
		`${API_PREFIX}/admin/pools/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(updates),
		},
	);
}

/**
 * Disable a pool
 */
export async function disablePool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(
		`${API_PREFIX}/admin/pools/${id}/disable`,
		{
			method: "POST",
		},
	);
}

/**
 * Enable a pool
 */
export async function enablePool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(
		`${API_PREFIX}/admin/pools/${id}/enable`,
		{
			method: "POST",
		},
	);
}

/**
 * Get users in a pool
 */
export async function getPoolUsers(
	id: number,
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<User>> {
	return await apiRequest<PaginatedResponse<User>>(
		`${API_PREFIX}/admin/pools/${id}/users?page=${page}&limit=${limit}`,
	);
}

/**
 * Add user to pool
 */
export async function addUserToPool(
	poolId: number,
	userId: string,
): Promise<ApiResponse<void>> {
	return await apiRequest<ApiResponse<void>>(
		`${API_PREFIX}/admin/pools/${poolId}/users/${userId}`,
		{
			method: "POST",
		},
	);
}

/**
 * Remove user from pool
 */
export async function removeUserFromPool(
	poolId: number,
	userId: string,
): Promise<ApiResponse<void>> {
	return await apiRequest<ApiResponse<void>>(
		`${API_PREFIX}/admin/pools/${poolId}/users/${userId}`,
		{
			method: "DELETE",
		},
	);
}

/**
 * Get pools for a user
 */
export async function getUserPools(
	userId: string,
): Promise<ApiResponse<Pool[]>> {
	return await apiRequest<ApiResponse<Pool[]>>(
		`${API_PREFIX}/admin/users/${userId}/pools`,
	);
}

/**
 * Meeting Management API Functions
 */

/**
 * Get paginated list of meetings
 */
export async function getMeetings(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<MeetingWithPool>> {
	return await apiRequest<PaginatedResponse<MeetingWithPool>>(
		`${API_PREFIX}/admin/meetings?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single meeting by ID
 */
export async function getMeeting(
	id: number,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>(
		`${API_PREFIX}/admin/meetings/${id}`,
	);
}

/**
 * Create a new meeting
 */
export async function createMeeting(
	meeting: CreateMeetingRequest,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>(
		`${API_PREFIX}/admin/meetings`,
		{
			method: "POST",
			body: JSON.stringify(meeting),
		},
	);
}

/**
 * Update a meeting
 */
export async function updateMeeting(
	id: number,
	updates: UpdateMeetingRequest,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>(
		`${API_PREFIX}/admin/meetings/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(updates),
		},
	);
}

/**
 * Delete a meeting
 */
export async function deleteMeeting(id: number): Promise<ApiResponse<void>> {
	return await apiRequest<ApiResponse<void>>(
		`${API_PREFIX}/admin/meetings/${id}`,
		{
			method: "DELETE",
		},
	);
}

/**
 * Motion Management API Functions
 */

/**
 * Get paginated list of motions for a meeting
 */
export async function getMotions(
	meetingId: number,
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<MotionWithPool>> {
	return await apiRequest<PaginatedResponse<MotionWithPool>>(
		`${API_PREFIX}/admin/meetings/${meetingId}/motions?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single motion by ID
 */
export async function getMotion(
	id: number,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`${API_PREFIX}/admin/motions/${id}`,
	);
}

/**
 * Create a new motion
 */
export async function createMotion(
	motion: CreateMotionRequest,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`${API_PREFIX}/admin/meetings/${motion.meetingId}/motions`,
		{
			method: "POST",
			body: JSON.stringify(motion),
		},
	);
}

/**
 * Update a motion
 */
export async function updateMotion(
	id: number,
	updates: UpdateMotionRequest,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`${API_PREFIX}/admin/motions/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(updates),
		},
	);
}

/**
 * Update motion status (forward-only transitions)
 */
export async function updateMotionStatus(
	id: number,
	statusUpdate: UpdateMotionStatusRequest,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`${API_PREFIX}/admin/motions/${id}/status`,
		{
			method: "PUT",
			body: JSON.stringify(statusUpdate),
		},
	);
}

/**
 * Delete a motion
 */
export async function deleteMotion(id: number): Promise<ApiResponse<void>> {
	return await apiRequest<ApiResponse<void>>(
		`${API_PREFIX}/admin/motions/${id}`,
		{
			method: "DELETE",
		},
	);
}

/**
 * Get vote statistics for a motion
 */
export async function getMotionVoteStats(
	motionId: number,
): Promise<ApiResponse<MotionVoteStats>> {
	return await apiRequest<ApiResponse<MotionVoteStats>>(
		`${API_PREFIX}/admin/motions/${motionId}/vote-stats`,
	);
}

/**
 * Get detailed results for a completed motion
 */
export async function getMotionDetailedResults(
	motionId: number,
): Promise<ApiResponse<MotionDetailedResults>> {
	return await apiRequest<ApiResponse<MotionDetailedResults>>(
		`${API_PREFIX}/admin/motions/${motionId}/results`,
	);
}

/**
 * Choice Management API Functions
 */

/**
 * Get choices for a motion
 */
export async function getChoices(
	motionId: number,
): Promise<ApiResponse<Choice[]>> {
	return await apiRequest<ApiResponse<Choice[]>>(
		`${API_PREFIX}/admin/motions/${motionId}/choices`,
	);
}

/**
 * Create a new choice
 */
export async function createChoice(
	choice: CreateChoiceRequest,
): Promise<ApiResponse<Choice>> {
	return await apiRequest<ApiResponse<Choice>>(
		`${API_PREFIX}/admin/motions/${choice.motionId}/choices`,
		{
			method: "POST",
			body: JSON.stringify(choice),
		},
	);
}

/**
 * Update a choice
 */
export async function updateChoice(
	id: number,
	updates: UpdateChoiceRequest,
): Promise<ApiResponse<Choice>> {
	return await apiRequest<ApiResponse<Choice>>(
		`${API_PREFIX}/admin/choices/${id}`,
		{
			method: "PUT",
			body: JSON.stringify(updates),
		},
	);
}

/**
 * Reorder choices for a motion
 */
export async function reorderChoices(
	motionId: number,
	choiceIds: number[],
): Promise<ApiResponse<Choice[]>> {
	return await apiRequest<ApiResponse<Choice[]>>(
		`${API_PREFIX}/admin/motions/${motionId}/choices/reorder`,
		{
			method: "PUT",
			body: JSON.stringify({ choiceIds }),
		},
	);
}

/**
 * Delete a choice
 */
export async function deleteChoice(id: number): Promise<ApiResponse<void>> {
	return await apiRequest<ApiResponse<void>>(
		`${API_PREFIX}/admin/choices/${id}`,
		{
			method: "DELETE",
		},
	);
}

/**
 * Authentication API Functions
 */

/**
 * Login with username and password
 */
export async function login(
	credentials: LoginRequest,
): Promise<ApiResponse<LoginResponse>> {
	return await apiRequest<ApiResponse<LoginResponse>>(
		`${API_PREFIX}/auth/login`,
		{
			method: "POST",
			body: JSON.stringify(credentials),
		},
	);
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ApiResponse<AuthUser>> {
	return await apiRequest<ApiResponse<AuthUser>>(`${API_PREFIX}/auth/me`);
}

/**
 * Voter API Functions
 */

/**
 * Get open motions for the current authenticated voter
 */
export async function getOpenMotions(): Promise<
	ApiResponse<OpenMotionsResponse>
> {
	return await apiRequest<ApiResponse<OpenMotionsResponse>>(
		`${API_PREFIX}/voter/motions/open`,
	);
}

/**
 * Get motion details for voting (includes choices and vote status)
 */
export async function getMotionForVoting(
	motionId: number,
): Promise<ApiResponse<MotionForVoting>> {
	return await apiRequest<ApiResponse<MotionForVoting>>(
		`${API_PREFIX}/voter/motions/${motionId}`,
	);
}

/**
 * Cast a vote on a motion
 */
export async function castVote(
	motionId: number,
	request: CastVoteRequest,
): Promise<ApiResponse<CastVoteResponse>> {
	return await apiRequest<ApiResponse<CastVoteResponse>>(
		`${API_PREFIX}/voter/motions/${motionId}/vote`,
		{
			method: "POST",
			body: JSON.stringify(request),
		},
	);
}

/**
 * Get pools for the current authenticated voter
 */
export async function getMyPools(): Promise<ApiResponse<Pool[]>> {
	return await apiRequest<ApiResponse<Pool[]>>(`${API_PREFIX}/voter/pools`);
}

/**
 * Quorum Management API Functions
 */

/**
 * Get quorum report for a meeting
 */
export async function getQuorumReport(
	meetingId: number,
): Promise<ApiResponse<QuorumReport>> {
	return await apiRequest<ApiResponse<QuorumReport>>(
		`${API_PREFIX}/admin/meetings/${meetingId}/quorum`,
	);
}

/**
 * Call or uncall quorum for a meeting
 */
export async function updateQuorum(
	meetingId: number,
	quorumCalledAt: string | null,
): Promise<ApiResponse<QuorumReport>> {
	return await apiRequest<ApiResponse<QuorumReport>>(
		`${API_PREFIX}/admin/meetings/${meetingId}/quorum`,
		{
			method: "PUT",
			body: JSON.stringify({ quorumCalledAt }),
		},
	);
}

/**
 * Get list of active voters for quorum
 */
export async function getQuorumVoters(
	meetingId: number,
): Promise<ApiResponse<QuorumActiveVoter[]>> {
	return await apiRequest<ApiResponse<QuorumActiveVoter[]>>(
		`${API_PREFIX}/admin/meetings/${meetingId}/quorum/voters`,
	);
}

/**
 * Watcher API Functions
 */

interface WatcherMeetingsResponse {
	data: WatcherMeetingReport[];
	pagination: Pagination;
}

/**
 * Get all meetings for watcher (with motion summaries)
 */
export async function getWatcherMeetings(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<WatcherMeetingsResponse> {
	return await apiRequest<WatcherMeetingsResponse>(
		`${API_PREFIX}/watcher/meetings?page=${page}&limit=${limit}`,
	);
}

/**
 * Get detailed meeting report for watcher
 */
export async function getWatcherMeetingReport(
	meetingId: number,
): Promise<ApiResponse<WatcherMeetingReport>> {
	return await apiRequest<ApiResponse<WatcherMeetingReport>>(
		`${API_PREFIX}/watcher/meetings/${meetingId}`,
	);
}

/**
 * Get quorum report for watcher (read-only)
 */
export async function getWatcherQuorumReport(
	meetingId: number,
): Promise<ApiResponse<QuorumReport>> {
	return await apiRequest<ApiResponse<QuorumReport>>(
		`${API_PREFIX}/watcher/meetings/${meetingId}/quorum`,
	);
}

/**
 * Get quorum voters for watcher (read-only)
 */
export async function getWatcherQuorumVoters(
	meetingId: number,
): Promise<ApiResponse<QuorumActiveVoter[]>> {
	return await apiRequest<ApiResponse<QuorumActiveVoter[]>>(
		`${API_PREFIX}/watcher/meetings/${meetingId}/quorum/voters`,
	);
}

/**
 * Get detailed motion information for watcher motion report page
 */
export async function getWatcherMotionDetail(
	motionId: number,
): Promise<ApiResponse<WatcherMotionDetail>> {
	return await apiRequest<ApiResponse<WatcherMotionDetail>>(
		`${API_PREFIX}/watcher/motions/${motionId}`,
	);
}

/**
 * Get voters for a completed motion (who voted, not what they voted for)
 */
export async function getWatcherMotionVoters(
	motionId: number,
): Promise<ApiResponse<WatcherMotionVoter[]>> {
	return await apiRequest<ApiResponse<WatcherMotionVoter[]>>(
		`${API_PREFIX}/watcher/motions/${motionId}/voters`,
	);
}

/**
 * Get results for a completed motion
 */
export async function getWatcherMotionResult(
	motionId: number,
): Promise<ApiResponse<WatcherMotionResult>> {
	return await apiRequest<ApiResponse<WatcherMotionResult>>(
		`${API_PREFIX}/watcher/motions/${motionId}/results`,
	);
}

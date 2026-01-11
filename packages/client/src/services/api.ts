/**
 * API service for communicating with the backend
 */
import type {
	User,
	CreateUserRequest,
	BulkPasswordResponse,
	PasswordGenerationResult,
	Pool,
	CreatePoolRequest,
	UpdatePoolRequest,
	MeetingWithPool,
	CreateMeetingRequest,
	UpdateMeetingRequest,
	MotionWithPool,
	CreateMotionRequest,
	UpdateMotionRequest,
	UpdateMotionStatusRequest,
	Choice,
	CreateChoiceRequest,
	UpdateChoiceRequest,
} from "@mcdc-convention-voting/shared";

// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_API_URL = "http://localhost:3000";

// Type guard for import.meta.env
function getApiBaseUrl(): string {
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring, @typescript-eslint/no-unsafe-assignment -- import.meta.env is typed as any in Vite
	const viteApiUrl = import.meta.env.VITE_API_URL;
	if (typeof viteApiUrl === "string") {
		return viteApiUrl;
	}
	return DEFAULT_API_URL;
}

const API_BASE_URL = getApiBaseUrl();

interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
}

interface ApiResponse<T> {
	success: boolean;
	message?: string;
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

	const url = `${API_BASE_URL}/api/admin/users/upload`;
	const response = await fetch(url, {
		method: "POST",
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
 * Get paginated list of users
 */
export async function getUsers(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<User>> {
	return await apiRequest<PaginatedResponse<User>>(
		`/api/admin/users?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single user by ID
 */
export async function getUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(`/api/admin/users/${id}`);
}

/**
 * Create a new user
 */
export async function createUser(
	userData: CreateUserRequest,
): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>("/api/admin/users", {
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
	return await apiRequest<ApiResponse<User>>(`/api/admin/users/${id}`, {
		method: "PUT",
		body: JSON.stringify(userData),
	});
}

/**
 * Disable a user
 */
export async function disableUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(`/api/admin/users/${id}/disable`, {
		method: "POST",
	});
}

/**
 * Enable a user
 */
export async function enableUser(id: string): Promise<ApiResponse<User>> {
	return await apiRequest<ApiResponse<User>>(`/api/admin/users/${id}/enable`, {
		method: "POST",
	});
}

/**
 * Generate passwords for all users without passwords
 */
export async function generatePasswords(): Promise<
	ApiResponse<BulkPasswordResponse>
> {
	return await apiRequest<ApiResponse<BulkPasswordResponse>>(
		"/api/admin/users/generate-passwords",
		{
			method: "POST",
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
		`/api/admin/users/${id}/reset-password`,
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
	return await apiRequest<ApiResponse<SystemSettings>>("/api/admin/settings");
}

/**
 * Update login enabled setting
 */
export async function updateLoginEnabled(
	enabled: boolean,
): Promise<ApiResponse<SystemSettings>> {
	return await apiRequest<ApiResponse<SystemSettings>>(
		"/api/admin/settings/login-enabled",
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

	const requestHeaders = new Headers();
	// Don't set Content-Type for FormData - browser will set it with boundary

	const response = await fetch(`${API_BASE_URL}/api/admin/pools/upload`, {
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
 * Get paginated list of pools
 */
export async function getPools(
	page = DEFAULT_PAGE,
	limit = DEFAULT_PAGE_LIMIT,
): Promise<PaginatedResponse<Pool>> {
	return await apiRequest<PaginatedResponse<Pool>>(
		`/api/admin/pools?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single pool by ID
 */
export async function getPool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(`/api/admin/pools/${id}`);
}

/**
 * Create a new pool
 */
export async function createPool(
	pool: CreatePoolRequest,
): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>("/api/admin/pools", {
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
	return await apiRequest<ApiResponse<Pool>>(`/api/admin/pools/${id}`, {
		method: "PUT",
		body: JSON.stringify(updates),
	});
}

/**
 * Disable a pool
 */
export async function disablePool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(`/api/admin/pools/${id}/disable`, {
		method: "POST",
	});
}

/**
 * Enable a pool
 */
export async function enablePool(id: number): Promise<ApiResponse<Pool>> {
	return await apiRequest<ApiResponse<Pool>>(`/api/admin/pools/${id}/enable`, {
		method: "POST",
	});
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
		`/api/admin/pools/${id}/users?page=${page}&limit=${limit}`,
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
		`/api/admin/pools/${poolId}/users/${userId}`,
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
		`/api/admin/pools/${poolId}/users/${userId}`,
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
		`/api/admin/users/${userId}/pools`,
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
		`/api/admin/meetings?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single meeting by ID
 */
export async function getMeeting(
	id: number,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>(
		`/api/admin/meetings/${id}`,
	);
}

/**
 * Create a new meeting
 */
export async function createMeeting(
	meeting: CreateMeetingRequest,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>("/api/admin/meetings", {
		method: "POST",
		body: JSON.stringify(meeting),
	});
}

/**
 * Update a meeting
 */
export async function updateMeeting(
	id: number,
	updates: UpdateMeetingRequest,
): Promise<ApiResponse<MeetingWithPool>> {
	return await apiRequest<ApiResponse<MeetingWithPool>>(
		`/api/admin/meetings/${id}`,
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
	return await apiRequest<ApiResponse<void>>(`/api/admin/meetings/${id}`, {
		method: "DELETE",
	});
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
		`/api/admin/meetings/${meetingId}/motions?page=${page}&limit=${limit}`,
	);
}

/**
 * Get a single motion by ID
 */
export async function getMotion(
	id: number,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`/api/admin/motions/${id}`,
	);
}

/**
 * Create a new motion
 */
export async function createMotion(
	motion: CreateMotionRequest,
): Promise<ApiResponse<MotionWithPool>> {
	return await apiRequest<ApiResponse<MotionWithPool>>(
		`/api/admin/meetings/${motion.meetingId}/motions`,
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
		`/api/admin/motions/${id}`,
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
		`/api/admin/motions/${id}/status`,
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
	return await apiRequest<ApiResponse<void>>(`/api/admin/motions/${id}`, {
		method: "DELETE",
	});
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
		`/api/admin/motions/${motionId}/choices`,
	);
}

/**
 * Create a new choice
 */
export async function createChoice(
	choice: CreateChoiceRequest,
): Promise<ApiResponse<Choice>> {
	return await apiRequest<ApiResponse<Choice>>(
		`/api/admin/motions/${choice.motionId}/choices`,
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
	return await apiRequest<ApiResponse<Choice>>(`/api/admin/choices/${id}`, {
		method: "PUT",
		body: JSON.stringify(updates),
	});
}

/**
 * Reorder choices for a motion
 */
export async function reorderChoices(
	motionId: number,
	choiceIds: number[],
): Promise<ApiResponse<Choice[]>> {
	return await apiRequest<ApiResponse<Choice[]>>(
		`/api/admin/motions/${motionId}/choices/reorder`,
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
	return await apiRequest<ApiResponse<void>>(`/api/admin/choices/${id}`, {
		method: "DELETE",
	});
}

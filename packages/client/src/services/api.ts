/**
 * API service for communicating with the backend
 */
import type {
	User,
	CreateUserRequest,
	BulkPasswordResponse,
	PasswordGenerationResult,
} from "@mcdc-convention-voting/shared";

// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_API_URL = "http://localhost:3000";

// Type guard for import.meta.env
function getApiBaseUrl(): string {
	const { VITE_API_URL } = import.meta.env;
	if (typeof VITE_API_URL === "string") {
		return VITE_API_URL;
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
	// We trust the API response matches type T
	// TypeScript's any from response.json() is unavoidable without runtime validation
	return await response.json();
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

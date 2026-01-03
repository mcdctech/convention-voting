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
	userCount: number;
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

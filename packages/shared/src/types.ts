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
}

/**
 * Request to create a single user
 */
export interface CreateUserRequest {
  voterId: string;
  firstName: string;
  lastName: string;
  username?: string; // Optional, will be auto-generated if not provided
}

/**
 * Request to update user details
 */
export interface UpdateUserRequest {
  voterId?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
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

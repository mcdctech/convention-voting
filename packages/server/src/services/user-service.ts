/**
 * User management service
 */
import { db } from "../database/db.js";
import { generatePassword, hashPassword } from "../utils/password-generator.js";
import { generateUniqueUsername } from "../utils/username-generator.js";
import { setUserPools } from "./pool-service.js";
import type {
	User,
	CreateUserRequest,
	UpdateUserRequest,
	PasswordGenerationResult,
	SystemSettings,
} from "@mcdc-convention-voting/shared";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const PAGE_OFFSET_ADJUSTMENT = 1;

/**
 * Check if a username already exists
 */
export async function usernameExists(username: string): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		"SELECT EXISTS(SELECT 1 FROM users WHERE username = :username) as exists",
		{ username },
	);
	return result.rows[FIRST_ROW].exists;
}

/**
 * Check if a voter ID already exists
 */
export async function voterIdExists(voterId: string): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		"SELECT EXISTS(SELECT 1 FROM users WHERE voter_id = :voterId) as exists",
		{ voterId },
	);
	return result.rows[FIRST_ROW].exists;
}

/**
 * Create a single user
 */
export async function createUser(request: CreateUserRequest): Promise<User> {
	const { voterId, firstName, lastName, username, poolKeys } = request;

	// Check if voter ID already exists
	if (await voterIdExists(voterId)) {
		throw new Error(`User with voter ID ${voterId} already exists`);
	}

	// Generate username if not provided
	const finalUsername =
		username !== undefined && username !== ""
			? username
			: await generateUniqueUsername(firstName, lastName, usernameExists);

	// Check if username already exists (in case one was provided)
	if (await usernameExists(finalUsername)) {
		throw new Error(`Username ${finalUsername} already exists`);
	}

	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO users (username, voter_id, first_name, last_name, password_hash)
     VALUES (:username, :voterId, :firstName, :lastName, NULL)
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
		{ username: finalUsername, voterId, firstName, lastName },
	);

	const {
		rows: [row],
	} = result;
	const user: User = {
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};

	// Associate user with pools if provided
	if (poolKeys !== undefined && poolKeys.length > EMPTY_ARRAY_LENGTH) {
		await setUserPools(user.id, poolKeys);
	}

	return user;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		"SELECT id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at FROM users WHERE id = :userId",
		{ userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * List users with pagination
 */
export async function listUsers(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ users: User[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM users",
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, 10);

	// Get paginated users with pool names
	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
		pool_names: string[] | null;
	}>(
		`SELECT
       u.id, u.username, u.voter_id, u.first_name, u.last_name,
       u.is_admin, u.is_disabled, u.created_at, u.updated_at,
       array_agg(p.pool_name ORDER BY p.pool_name) FILTER (WHERE p.pool_name IS NOT NULL) as pool_names
     FROM users u
     LEFT JOIN user_pools up ON u.id = up.user_id
     LEFT JOIN pools p ON up.pool_id = p.id
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT :limit OFFSET :offset`,
		{ limit, offset },
	);

	const users = result.rows.map((row) => ({
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		poolNames: row.pool_names ?? undefined,
	}));

	return { users, total };
}

/**
 * Update user details
 */
// eslint-disable-next-line complexity -- Function requires multiple validation branches for updating different user fields
export async function updateUser(
	userId: string,
	updates: UpdateUserRequest,
): Promise<User> {
	const { voterId, firstName, lastName, username, poolKeys } = updates;

	// Build dynamic update query
	const setClauses: string[] = [];
	const values: Record<string, unknown> = { userId };

	if (voterId !== undefined) {
		// Check if new voter ID already exists
		if (await voterIdExists(voterId)) {
			const existingUser = await db.query<{ id: string }>(
				"SELECT id FROM users WHERE voter_id = :voterId",
				{ voterId },
			);
			// Only throw error if it's a different user
			if (existingUser.rows[FIRST_ROW].id !== userId) {
				throw new Error(`Voter ID ${voterId} already exists`);
			}
		}
		setClauses.push(`voter_id = :voterId`);
		values.voterId = voterId;
	}

	if (firstName !== undefined) {
		setClauses.push(`first_name = :firstName`);
		values.firstName = firstName;
	}

	if (lastName !== undefined) {
		setClauses.push(`last_name = :lastName`);
		values.lastName = lastName;
	}

	if (username !== undefined) {
		// Check if new username already exists
		if (await usernameExists(username)) {
			const existingUser = await db.query<{ id: string }>(
				"SELECT id FROM users WHERE username = :username",
				{ username },
			);
			// Only throw error if it's a different user
			if (existingUser.rows[FIRST_ROW].id !== userId) {
				throw new Error(`Username ${username} already exists`);
			}
		}
		setClauses.push(`username = :username`);
		values.username = username;
	}

	if (setClauses.length === EMPTY_ARRAY_LENGTH && poolKeys === undefined) {
		throw new Error("No fields to update");
	}

	// Update user fields if there are any changes
	// eslint-disable-next-line @typescript-eslint/init-declarations -- User is initialized in all branches below
	let user: User;
	if (setClauses.length > EMPTY_ARRAY_LENGTH) {
		// Add updated_at
		setClauses.push(`updated_at = NOW()`);

		const result = await db.query<{
			id: string;
			username: string;
			voter_id: string | null;
			first_name: string;
			last_name: string;
			is_admin: boolean;
			is_disabled: boolean;
			created_at: Date;
			updated_at: Date;
		}>(
			`UPDATE users
       SET ${setClauses.join(", ")}
       WHERE id = :userId
       RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
			values,
		);

		if (result.rows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(`User with ID ${userId} not found`);
		}

		const {
			rows: [row],
		} = result;
		user = {
			id: row.id,
			username: row.username,
			voterId: row.voter_id,
			firstName: row.first_name,
			lastName: row.last_name,
			isAdmin: row.is_admin,
			isDisabled: row.is_disabled,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	} else {
		// No user fields to update, just fetch the user
		const existingUser = await getUserById(userId);
		if (existingUser === null) {
			throw new Error(`User with ID ${userId} not found`);
		}
		user = existingUser;
	}

	// Update pool associations if provided
	if (poolKeys !== undefined) {
		await setUserPools(userId, poolKeys);
	}

	return user;
}

/**
 * Disable a user
 */
export async function disableUser(userId: string): Promise<User> {
	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE users
     SET is_disabled = TRUE, updated_at = NOW()
     WHERE id = :userId
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
		{ userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`User with ID ${userId} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Enable a user
 */
export async function enableUser(userId: string): Promise<User> {
	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE users
     SET is_disabled = FALSE, updated_at = NOW()
     WHERE id = :userId
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
		{ userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`User with ID ${userId} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Generate passwords for all users
 */
export async function generatePasswordsForUsers(): Promise<
	PasswordGenerationResult[]
> {
	// Get all users
	const usersResult = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
	}>("SELECT id, username, voter_id FROM users");

	const results: PasswordGenerationResult[] = [];

	// Generate and set passwords for each user
	for (const user of usersResult.rows) {
		const password = generatePassword();
		// eslint-disable-next-line no-await-in-loop -- Sequential password generation required for security
		const hashedPassword = await hashPassword(password);

		// eslint-disable-next-line no-await-in-loop -- Sequential database update required for password generation
		await db.query(
			"UPDATE users SET password_hash = :hashedPassword, updated_at = NOW() WHERE id = :userId",
			{ hashedPassword, userId: user.id },
		);

		results.push({
			voterId: user.voter_id ?? "N/A",
			username: user.username,
			password,
		});
	}

	return results;
}

/**
 * Reset a user's password
 */
export async function resetUserPassword(userId: string): Promise<string> {
	const password = generatePassword();
	const hashedPassword = await hashPassword(password);

	const result = await db.query<{ id: string }>(
		"UPDATE users SET password_hash = :hashedPassword, updated_at = NOW() WHERE id = :userId RETURNING id",
		{ hashedPassword, userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`User with ID ${userId} not found`);
	}

	return password;
}

/**
 * Get system settings
 */
export async function getSystemSettings(): Promise<SystemSettings> {
	const result = await db.query<{ setting_value: string }>(
		"SELECT setting_value FROM system_settings WHERE setting_key = :settingKey",
		{ settingKey: "non_admin_login_enabled" },
	);

	return {
		nonAdminLoginEnabled: result.rows[FIRST_ROW]?.setting_value === "true",
	};
}

/**
 * Update system setting for non-admin login
 */
export async function setNonAdminLoginEnabled(enabled: boolean): Promise<void> {
	await db.query(
		`INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES (:settingKey, :settingValue, NOW())
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = :settingValue, updated_at = NOW()`,
		{ settingKey: "non_admin_login_enabled", settingValue: enabled.toString() },
	);
}

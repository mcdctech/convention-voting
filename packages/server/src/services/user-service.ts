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
	GeneratePasswordsRequest,
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
 * Validate user creation request and prepare values
 */
async function validateAndPrepareUserCreation(
	request: CreateUserRequest,
): Promise<{
	finalUsername: string;
	finalIsAdmin: boolean;
	finalIsWatcher: boolean;
}> {
	const { voterId, firstName, lastName, username, isAdmin, isWatcher } =
		request;

	// Normalize role flags to booleans
	const finalIsAdmin = isAdmin === true;
	const finalIsWatcher = isWatcher === true;

	// Validate role exclusivity
	if (finalIsAdmin && finalIsWatcher) {
		throw new Error("User cannot be both admin and watcher");
	}

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

	return { finalUsername, finalIsAdmin, finalIsWatcher };
}

/**
 * Create a single user
 */
export async function createUser(request: CreateUserRequest): Promise<User> {
	const { voterId, firstName, lastName, poolKeys } = request;

	const { finalUsername, finalIsAdmin, finalIsWatcher } =
		await validateAndPrepareUserCreation(request);

	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO users (username, voter_id, first_name, last_name, password_hash, is_admin, is_watcher)
     VALUES (:username, :voterId, :firstName, :lastName, NULL, :isAdmin, :isWatcher)
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at`,
		{
			username: finalUsername,
			voterId,
			firstName,
			lastName,
			isAdmin: finalIsAdmin,
			isWatcher: finalIsWatcher,
		},
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
		isWatcher: row.is_watcher,
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
 * Upsert a single user (insert or update on conflict)
 * Used for idempotent CSV uploads - if voter_id exists, updates the user instead of erroring
 * Username is preserved for existing users
 */
export async function upsertUser(request: CreateUserRequest): Promise<User> {
	const {
		voterId,
		firstName,
		lastName,
		username,
		isAdmin,
		isWatcher,
		isDisabled,
		poolKeys,
	} = request;

	// Normalize role flags to booleans
	const finalIsAdmin = isAdmin === true;
	const finalIsWatcher = isWatcher === true;
	const finalIsDisabled = isDisabled === true;

	// Validate role exclusivity
	if (finalIsAdmin && finalIsWatcher) {
		throw new Error("User cannot be both admin and watcher");
	}

	// Generate username for potential insert (will be ignored if user exists)
	const generatedUsername =
		username !== undefined && username !== ""
			? username
			: await generateUniqueUsername(firstName, lastName, usernameExists);

	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO users (username, voter_id, first_name, last_name, password_hash, is_admin, is_watcher, is_disabled)
     VALUES (:username, :voterId, :firstName, :lastName, NULL, :isAdmin, :isWatcher, :isDisabled)
     ON CONFLICT (voter_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       is_admin = EXCLUDED.is_admin,
       is_watcher = EXCLUDED.is_watcher,
       is_disabled = EXCLUDED.is_disabled,
       updated_at = NOW()
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at`,
		{
			username: generatedUsername,
			voterId,
			firstName,
			lastName,
			isAdmin: finalIsAdmin,
			isWatcher: finalIsWatcher,
			isDisabled: finalIsDisabled,
		},
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
		isWatcher: row.is_watcher,
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
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		"SELECT id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at FROM users WHERE id = :userId",
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
		isWatcher: row.is_watcher,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Build query clauses and parameters for user listing
 */
function buildUserListQueryParts(
	search?: string,
	poolId?: number,
): {
	whereClause: string;
	poolJoin: string;
	params: Record<string, unknown>;
} {
	const searchTerm =
		search === undefined || search.trim() === "" ? null : search.trim();
	const hasSearch = searchTerm !== null;
	const hasPoolFilter = poolId !== undefined;

	const whereConditions: string[] = [];
	const params: Record<string, unknown> = {};

	if (hasSearch) {
		whereConditions.push(
			"(u.first_name ILIKE :search_pattern OR u.last_name ILIKE :search_pattern OR (u.first_name || ' ' || u.last_name) ILIKE :search_pattern OR u.username ILIKE :search_pattern OR u.voter_id ILIKE :search_pattern)",
		);
		params.search_pattern = `%${searchTerm}%`;
	}
	if (hasPoolFilter) {
		whereConditions.push("filter_up.pool_id = :pool_id");
		params.pool_id = poolId;
	}

	const whereClause =
		whereConditions.length > EMPTY_ARRAY_LENGTH
			? `WHERE ${whereConditions.join(" AND ")}`
			: "";

	const poolJoin = hasPoolFilter
		? "INNER JOIN user_pools filter_up ON u.id = filter_up.user_id"
		: "";

	return { whereClause, poolJoin, params };
}

/**
 * List users with pagination and optional search/pool filter
 */
export async function listUsers(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
	search?: string,
	poolId?: number,
): Promise<{ users: User[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;
	const { whereClause, poolJoin, params } = buildUserListQueryParts(
		search,
		poolId,
	);

	// Add pagination params
	const queryParams = { ...params, limit, offset };

	// Get total count (with optional filters)
	const countQuery = `SELECT COUNT(DISTINCT u.id) as count FROM users u ${poolJoin} ${whereClause}`;
	const countResult = await db.query<{ count: string }>(countQuery, params);
	const total = parseInt(countResult.rows[FIRST_ROW].count, 10);

	// Get paginated users with pool names
	const result = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
		pool_names: string[] | null;
	}>(
		`SELECT
       u.id, u.username, u.voter_id, u.first_name, u.last_name,
       u.is_admin, u.is_watcher, u.is_disabled, u.created_at, u.updated_at,
       array_agg(p.pool_name ORDER BY p.pool_name) FILTER (WHERE p.pool_name IS NOT NULL) as pool_names
     FROM users u
     ${poolJoin}
     LEFT JOIN user_pools up ON u.id = up.user_id
     LEFT JOIN pools p ON up.pool_id = p.id
     ${whereClause}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT :limit OFFSET :offset`,
		queryParams,
	);

	const users = result.rows.map((row) => ({
		id: row.id,
		username: row.username,
		voterId: row.voter_id,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isWatcher: row.is_watcher,
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
			is_watcher: boolean;
			is_disabled: boolean;
			created_at: Date;
			updated_at: Date;
		}>(
			`UPDATE users
       SET ${setClauses.join(", ")}
       WHERE id = :userId
       RETURNING id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at`,
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
			isWatcher: row.is_watcher,
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
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE users
     SET is_disabled = TRUE, updated_at = NOW()
     WHERE id = :userId
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at`,
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
		isWatcher: row.is_watcher,
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
		is_watcher: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE users
     SET is_disabled = FALSE, updated_at = NOW()
     WHERE id = :userId
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_watcher, is_disabled, created_at, updated_at`,
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
		isWatcher: row.is_watcher,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Generate passwords for users with optional filtering
 * Admin users are always excluded to prevent accidental credential changes
 *
 * @param options - Optional filters
 * @param options.poolId - Only generate for users in this pool
 * @param options.onlyNullPasswords - Only generate for users without existing passwords
 */
export async function generatePasswordsForUsers(
	options?: GeneratePasswordsRequest,
): Promise<PasswordGenerationResult[]> {
	const poolId = options?.poolId;
	const onlyNullPasswords = options?.onlyNullPasswords ?? false;

	// Build query with optional filters
	let query = `
		SELECT DISTINCT u.id, u.username, u.voter_id
		FROM users u
	`;

	// Join with user_pools if filtering by pool
	if (poolId === undefined) {
		query += `
		WHERE u.is_admin = FALSE
		`;
	} else {
		query += `
		INNER JOIN user_pools up ON u.id = up.user_id
		WHERE up.pool_id = :poolId AND u.is_admin = FALSE
		`;
	}

	// Add password filter if requested
	if (onlyNullPasswords) {
		query += ` AND u.password_hash IS NULL`;
	}

	const usersResult = await db.query<{
		id: string;
		username: string;
		voter_id: string | null;
	}>(query, { poolId: poolId ?? null });

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

/**
 * Ensure admin user from environment variables exists
 * Called on server startup to sync environment-based admin credentials
 *
 * If ADMIN_USERNAME and ADMIN_PASSWORD are set:
 * - Creates user if it doesn't exist
 * - Updates password if user exists (to sync with environment)
 * - Ensures user has admin privileges
 */
export async function ensureAdminUserFromEnvironment(): Promise<void> {
	const {
		env: { ADMIN_USERNAME, ADMIN_PASSWORD },
	} = process;

	// Skip if environment variables are not set
	if (
		ADMIN_USERNAME === undefined ||
		ADMIN_USERNAME === "" ||
		ADMIN_PASSWORD === undefined ||
		ADMIN_PASSWORD === ""
	) {
		return;
	}

	// Check if user exists
	const exists = await usernameExists(ADMIN_USERNAME);

	if (exists) {
		// Update existing user to sync password and ensure admin status
		const passwordHash = await hashPassword(ADMIN_PASSWORD);
		await db.query(
			`UPDATE users
       SET password_hash = :passwordHash,
           is_admin = TRUE,
           is_disabled = FALSE,
           updated_at = NOW()
       WHERE username = :username`,
			{
				username: ADMIN_USERNAME,
				passwordHash,
			},
		);
	} else {
		// Create new admin user
		const passwordHash = await hashPassword(ADMIN_PASSWORD);
		await db.query(
			`INSERT INTO users (id, username, password_hash, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at)
       VALUES (gen_random_uuid(), :username, :passwordHash, NULL, :firstName, :lastName, TRUE, FALSE, NOW(), NOW())`,
			{
				username: ADMIN_USERNAME,
				passwordHash,
				firstName: "Admin",
				lastName: "User",
			},
		);
	}
}

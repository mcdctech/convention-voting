/**
 * Pool management service
 */
import { db } from "../database/db.js";
import type {
	Pool,
	CreatePoolRequest,
	UpdatePoolRequest,
	User,
} from "@mcdc-convention-voting/shared";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const PAGE_OFFSET_ADJUSTMENT = 1;

/**
 * Check if a pool key already exists
 */
export async function poolKeyExists(poolKey: string): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		"SELECT EXISTS(SELECT 1 FROM pools WHERE pool_key = :poolKey) as exists",
		{ poolKey },
	);
	return result.rows[FIRST_ROW].exists;
}

/**
 * Get pool by ID
 */
export async function getPoolById(poolId: number): Promise<Pool | null> {
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>("SELECT * FROM pools WHERE id = :poolId", { poolId });

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get pool by key
 */
export async function getPoolByKey(poolKey: string): Promise<Pool | null> {
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>("SELECT * FROM pools WHERE pool_key = :poolKey", { poolKey });

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Create a single pool
 */
export async function createPool(request: CreatePoolRequest): Promise<Pool> {
	const { poolKey, poolName, description } = request;

	// Check if pool key already exists
	if (await poolKeyExists(poolKey)) {
		throw new Error(`Pool with key ${poolKey} already exists`);
	}

	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO pools (pool_key, pool_name, description)
     VALUES (:poolKey, :poolName, :description)
     RETURNING *`,
		{ poolKey, poolName, description: description ?? null },
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Upsert a single pool (insert or update on conflict)
 * Used for idempotent CSV uploads - if pool_key exists, updates the pool instead of erroring
 */
export async function upsertPool(request: CreatePoolRequest): Promise<Pool> {
	const { poolKey, poolName, description } = request;

	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`INSERT INTO pools (pool_key, pool_name, description)
     VALUES (:poolKey, :poolName, :description)
     ON CONFLICT (pool_key) DO UPDATE SET
       pool_name = EXCLUDED.pool_name,
       description = EXCLUDED.description,
       updated_at = NOW()
     RETURNING *`,
		{ poolKey, poolName, description: description ?? null },
	);

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * List pools with pagination
 */
export async function listPools(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ pools: Pool[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM pools",
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, 10);

	// Get paginated pools with user counts
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
		user_count: string;
	}>(
		`SELECT
       p.*,
       COUNT(up.user_id)::text as user_count
     FROM pools p
     LEFT JOIN user_pools up ON p.id = up.pool_id
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT :limit OFFSET :offset`,
		{ limit, offset },
	);

	const pools = result.rows.map((row) => ({
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		userCount: parseInt(row.user_count, 10),
	}));

	return { pools, total };
}

/**
 * Update pool details
 */
export async function updatePool(
	poolId: number,
	updates: UpdatePoolRequest,
): Promise<Pool> {
	const { poolKey, poolName, description } = updates;

	// Build dynamic update query
	const setClauses: string[] = [];
	const values: Record<string, unknown> = { poolId };

	if (poolKey !== undefined) {
		// Check if new pool key already exists
		if (await poolKeyExists(poolKey)) {
			const existingPool = await db.query<{ id: number }>(
				"SELECT id FROM pools WHERE pool_key = :poolKey",
				{ poolKey },
			);
			// Only throw error if it's a different pool
			const {
				rows: [existingRow],
			} = existingPool;
			if (existingRow.id !== poolId) {
				throw new Error(`Pool key ${poolKey} already exists`);
			}
		}
		setClauses.push(`pool_key = :poolKey`);
		values.poolKey = poolKey;
	}

	if (poolName !== undefined) {
		setClauses.push(`pool_name = :poolName`);
		values.poolName = poolName;
	}

	if (description !== undefined) {
		setClauses.push(`description = :description`);
		values.description = description;
	}

	if (setClauses.length === EMPTY_ARRAY_LENGTH) {
		throw new Error("No fields to update");
	}

	// Add updated_at
	setClauses.push(`updated_at = NOW()`);

	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE pools
     SET ${setClauses.join(", ")}
     WHERE id = :poolId
     RETURNING *`,
		values,
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Pool with ID ${poolId} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Disable a pool
 */
export async function disablePool(poolId: number): Promise<Pool> {
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE pools
     SET is_disabled = TRUE, updated_at = NOW()
     WHERE id = :poolId
     RETURNING *`,
		{ poolId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Pool with ID ${poolId} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Enable a pool
 */
export async function enablePool(poolId: number): Promise<Pool> {
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`UPDATE pools
     SET is_disabled = FALSE, updated_at = NOW()
     WHERE id = :poolId
     RETURNING *`,
		{ poolId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Pool with ID ${poolId} not found`);
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get users in a pool
 */
export async function getUsersInPool(
	poolId: number,
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ users: User[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count
	const countResult = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count
     FROM user_pools
     WHERE pool_id = :poolId`,
		{ poolId },
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, 10);

	// Get paginated users
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
		`SELECT u.id, u.username, u.voter_id, u.first_name, u.last_name,
            u.is_admin, u.is_watcher, u.is_disabled, u.created_at, u.updated_at
     FROM users u
     INNER JOIN user_pools up ON u.id = up.user_id
     WHERE up.pool_id = :poolId
     ORDER BY u.created_at DESC
     LIMIT :limit OFFSET :offset`,
		{ poolId, limit, offset },
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
	}));

	return { users, total };
}

/**
 * Get pools for a user
 */
export async function getPoolsForUser(userId: string): Promise<Pool[]> {
	const result = await db.query<{
		id: number;
		pool_key: string;
		pool_name: string;
		description: string | null;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`SELECT p.id, p.pool_key, p.pool_name, p.description,
            p.is_disabled, p.created_at, p.updated_at
     FROM pools p
     INNER JOIN user_pools up ON p.id = up.pool_id
     WHERE up.user_id = :userId
     ORDER BY p.created_at DESC`,
		{ userId },
	);

	return result.rows.map((row) => ({
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}

/**
 * Add user to pool
 */
export async function addUserToPool(
	poolId: number,
	userId: string,
): Promise<void> {
	await db.query(
		`INSERT INTO user_pools (pool_id, user_id)
     VALUES (:poolId, :userId)
     ON CONFLICT (pool_id, user_id) DO NOTHING`,
		{ poolId, userId },
	);
}

/**
 * Remove user from pool
 */
export async function removeUserFromPool(
	poolId: number,
	userId: string,
): Promise<void> {
	await db.query(
		`DELETE FROM user_pools
     WHERE pool_id = :poolId AND user_id = :userId`,
		{ poolId, userId },
	);
}

/**
 * Set user's pool associations (replaces all existing associations)
 */
export async function setUserPools(
	userId: string,
	poolKeys: string[],
): Promise<void> {
	// Start by removing all existing associations
	await db.query("DELETE FROM user_pools WHERE user_id = :userId", { userId });

	// Add new associations
	for (const poolKey of poolKeys) {
		// eslint-disable-next-line no-await-in-loop -- Sequential pool lookup required
		const pool = await getPoolByKey(poolKey);
		if (pool !== null) {
			// eslint-disable-next-line no-await-in-loop -- Sequential pool association required
			await addUserToPool(pool.id, userId);
		}
	}
}

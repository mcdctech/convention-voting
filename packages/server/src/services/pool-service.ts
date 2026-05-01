/**
 * Pool management service
 */
import {
	PoolType,
	type Pool,
	type CreatePoolRequest,
	type UpdatePoolRequest,
	type User,
} from "@mcdc-convention-voting/shared";
import { db, withTransaction } from "../database/db.js";
import { recordPendingPoolKeys } from "./pending-pool-service.js";
import type { TinyPg } from "tinypg";

// Array index constants
const FIRST_ROW = 0;
const EMPTY_ARRAY_LENGTH = 0;

// Pagination constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const PAGE_OFFSET_ADJUSTMENT = 1;

// Radix for parseInt
const DECIMAL_RADIX = 10;

/**
 * Database row type for pools
 */
interface PoolDbRow {
	id: number;
	pool_key: string;
	pool_name: string;
	description: string | null;
	pool_type: string | null;
	is_disabled: boolean;
	created_at: Date;
	updated_at: Date;
}

/**
 * Extended pool row with computed fields
 */
interface PoolDbRowWithComputed extends PoolDbRow {
	user_count?: string;
	is_quorum_pool?: boolean;
}

/**
 * Filter options for listing pools
 */
export interface ListPoolsOptions {
	page?: number;
	limit?: number;
	includeDisabled?: boolean;
	onlyQuorumPools?: boolean;
	poolType?: PoolType | "null" | null;
	forMeetingId?: number; // Filter to pools associated with a specific meeting
}

/**
 * Map database pool_type string to PoolType enum
 */
function mapPoolType(dbPoolType: string | null): PoolType | null {
	if (dbPoolType === null) {
		return null;
	}
	switch (dbPoolType) {
		case "voter":
			return PoolType.Voter;
		case "watcher":
			return PoolType.Watcher;
		case "meeting_admin":
			return PoolType.MeetingAdmin;
		default:
			return null;
	}
}

/**
 * Map a database row to a Pool object
 */
function mapRowToPool(row: PoolDbRowWithComputed): Pool {
	return {
		id: row.id,
		poolKey: row.pool_key,
		poolName: row.pool_name,
		description: row.description,
		poolType: mapPoolType(row.pool_type),
		isDisabled: row.is_disabled,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		...(row.user_count !== undefined && {
			userCount: parseInt(row.user_count, DECIMAL_RADIX),
		}),
		...(row.is_quorum_pool !== undefined && {
			isQuorumPool: row.is_quorum_pool,
		}),
	};
}

/**
 * Build WHERE clause and params for pool filtering
 */
function buildPoolFilterClauses(options: ListPoolsOptions): {
	clauses: string[];
	params: Record<string, unknown>;
} {
	const {
		includeDisabled = false,
		onlyQuorumPools = false,
		poolType,
		forMeetingId,
	} = options;
	const clauses: string[] = [];
	const params: Record<string, unknown> = {};

	if (!includeDisabled) {
		clauses.push("p.is_disabled = FALSE");
	}

	if (onlyQuorumPools) {
		clauses.push(
			"EXISTS(SELECT 1 FROM meetings m WHERE m.quorum_voting_pool_id = p.id)",
		);
	}

	if (poolType !== undefined) {
		if (poolType === "null" || poolType === null) {
			clauses.push("p.pool_type IS NULL");
		} else {
			clauses.push("p.pool_type = :poolType");
			params.poolType = poolType;
		}
	}

	// Filter to pools associated with a specific meeting
	if (forMeetingId !== undefined) {
		clauses.push(`(
			EXISTS(SELECT 1 FROM meetings m WHERE m.id = :forMeetingId AND m.quorum_voting_pool_id = p.id)
			OR EXISTS(SELECT 1 FROM meetings m WHERE m.id = :forMeetingId AND m.watcher_pool_id = p.id)
			OR EXISTS(SELECT 1 FROM meetings m WHERE m.id = :forMeetingId AND m.meeting_admin_pool_id = p.id)
			OR EXISTS(SELECT 1 FROM meeting_voter_pools mvp WHERE mvp.meeting_id = :forMeetingId AND mvp.pool_id = p.id)
		)`);
		params.forMeetingId = forMeetingId;
	}

	return { clauses, params };
}

/**
 * Build SET clauses for pool update
 */
function buildPoolUpdateClauses(
	updates: UpdatePoolRequest,
	poolId: number,
): { clauses: string[]; values: Record<string, unknown> } {
	const { poolKey, poolName, description, poolType } = updates;
	const clauses: string[] = [];
	const values: Record<string, unknown> = { poolId };

	if (poolKey !== undefined) {
		clauses.push("pool_key = :newPoolKey");
		values.newPoolKey = poolKey;
	}
	if (poolName !== undefined) {
		clauses.push("pool_name = :poolName");
		values.poolName = poolName;
	}
	if (description !== undefined) {
		clauses.push("description = :description");
		values.description = description;
	}
	if (poolType !== undefined) {
		clauses.push("pool_type = :poolType");
		values.poolType = poolType;
	}

	return { clauses, values };
}

/**
 * Resolve pending pool key assignments after a pool key change
 */
async function resolvePendingPoolAssignments(
	tx: TinyPg,
	poolId: number,
	keysToResolve: string[],
): Promise<number> {
	// Find all users with pending assignments for the keys
	const pendingUsersResult = await tx.query<{ user_id: string }>(
		`SELECT DISTINCT user_id FROM pending_pool_keys
     WHERE pool_key = ANY(:keysToResolve)`,
		{ keysToResolve },
	);

	// Add each user to the pool
	for (const { user_id: userId } of pendingUsersResult.rows) {
		// eslint-disable-next-line no-await-in-loop -- Sequential within transaction
		await tx.query(
			`INSERT INTO user_pools (pool_id, user_id)
       VALUES (:poolId, :userId)
       ON CONFLICT (pool_id, user_id) DO NOTHING`,
			{ poolId, userId },
		);
	}

	// Delete all resolved pending records
	await tx.query(
		`DELETE FROM pending_pool_keys WHERE pool_key = ANY(:keysToResolve)`,
		{ keysToResolve },
	);

	return pendingUsersResult.rows.length;
}

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

// Pool key generation constants
const INITIAL_COUNTER = 1;
const COUNTER_INCREMENT = 1;

/**
 * Generate a unique pool key from a meeting name
 * Slugifies the name and adds suffix, handling conflicts
 *
 * @param meetingName - The meeting name to slugify
 * @param suffix - Suffix to add (e.g., "watchers", "meeting-admins")
 * @returns A unique pool key
 */
export async function generatePoolKeyFromMeetingName(
	meetingName: string,
	suffix: string,
): Promise<string> {
	// Slugify: lowercase, replace spaces/special chars with hyphens, trim leading/trailing hyphens
	const slug = meetingName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(?:^-|-$)/g, "");

	let poolKey = `${slug}-${suffix}`;
	let counter = INITIAL_COUNTER;

	// Check for conflicts and increment counter if needed
	// eslint-disable-next-line no-await-in-loop -- Sequential uniqueness check required
	while (await poolKeyExists(poolKey)) {
		counter += COUNTER_INCREMENT;
		poolKey = `${slug}-${suffix}-${String(counter)}`;
	}

	return poolKey;
}

/**
 * Get pool by ID
 */
export async function getPoolById(poolId: number): Promise<Pool | null> {
	const result = await db.query<PoolDbRowWithComputed>(
		`SELECT p.*,
		   EXISTS(SELECT 1 FROM meetings m WHERE m.quorum_voting_pool_id = p.id) as is_quorum_pool
		 FROM pools p
		 WHERE p.id = :poolId`,
		{ poolId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	return mapRowToPool(result.rows[FIRST_ROW]);
}

/**
 * Get pool by key
 */
export async function getPoolByKey(poolKey: string): Promise<Pool | null> {
	const result = await db.query<PoolDbRowWithComputed>(
		`SELECT p.*,
		   EXISTS(SELECT 1 FROM meetings m WHERE m.quorum_voting_pool_id = p.id) as is_quorum_pool
		 FROM pools p
		 WHERE p.pool_key = :poolKey`,
		{ poolKey },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	return mapRowToPool(result.rows[FIRST_ROW]);
}

/**
 * Create a single pool
 */
export async function createPool(request: CreatePoolRequest): Promise<Pool> {
	const { poolKey, poolName, description, poolType } = request;

	// Check if pool key already exists
	if (await poolKeyExists(poolKey)) {
		throw new Error(`Pool with key ${poolKey} already exists`);
	}

	const result = await db.query<PoolDbRow>(
		`INSERT INTO pools (pool_key, pool_name, description, pool_type)
     VALUES (:poolKey, :poolName, :description, :poolType)
     RETURNING *`,
		{
			poolKey,
			poolName,
			description: description ?? null,
			poolType: poolType ?? null,
		},
	);

	return mapRowToPool(result.rows[FIRST_ROW]);
}

/**
 * Upsert a single pool (insert or update on conflict)
 * Used for idempotent CSV uploads - if pool_key exists, updates the pool instead of erroring
 */
export async function upsertPool(request: CreatePoolRequest): Promise<Pool> {
	const { poolKey, poolName, description, poolType } = request;

	const result = await db.query<PoolDbRow>(
		`INSERT INTO pools (pool_key, pool_name, description, pool_type)
     VALUES (:poolKey, :poolName, :description, :poolType)
     ON CONFLICT (pool_key) DO UPDATE SET
       pool_name = EXCLUDED.pool_name,
       description = EXCLUDED.description,
       pool_type = EXCLUDED.pool_type,
       updated_at = NOW()
     RETURNING *`,
		{
			poolKey,
			poolName,
			description: description ?? null,
			poolType: poolType ?? null,
		},
	);

	return mapRowToPool(result.rows[FIRST_ROW]);
}

/**
 * List pools with pagination and filtering
 */
export async function listPools(
	options: ListPoolsOptions = {},
): Promise<{ pools: Pool[]; total: number }> {
	const { page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = options;
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Build WHERE clauses using helper
	const { clauses, params } = buildPoolFilterClauses(options);
	params.limit = limit;
	params.offset = offset;

	const whereClause =
		clauses.length > EMPTY_ARRAY_LENGTH ? `WHERE ${clauses.join(" AND ")}` : "";

	// Get total count with filters
	const countResult = await db.query<{ count: string }>(
		`SELECT COUNT(*) as count FROM pools p ${whereClause}`,
		params,
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated pools with user counts and quorum flag
	const result = await db.query<PoolDbRowWithComputed>(
		`SELECT
       p.*,
       COUNT(up.user_id)::text as user_count,
       EXISTS(SELECT 1 FROM meetings m WHERE m.quorum_voting_pool_id = p.id) as is_quorum_pool
     FROM pools p
     LEFT JOIN user_pools up ON p.id = up.pool_id
     ${whereClause}
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT :limit OFFSET :offset`,
		params,
	);

	return { pools: result.rows.map(mapRowToPool), total };
}

/**
 * Result of updating a pool, including resolved pending assignments
 */
export interface UpdatePoolResult {
	pool: Pool;
	resolvedUsers: number;
}

/**
 * Update pool details
 *
 * When the pool key is changed, this function automatically resolves any
 * pending pool assignments that match either the OLD or NEW key:
 * - Users with pending assignments for the NEW key are added to this pool
 * - Users with pending assignments for the OLD key are added to this pool
 * - All resolved pending records are deleted
 */
export async function updatePool(
	poolId: number,
	updates: UpdatePoolRequest,
): Promise<UpdatePoolResult> {
	const { poolKey: newPoolKey } = updates;

	return await withTransaction(async (tx) => {
		// Get current pool data before updating
		const currentPoolResult = await tx.query<{
			id: number;
			pool_key: string;
		}>("SELECT id, pool_key FROM pools WHERE id = :poolId", { poolId });

		const { rows: poolRows } = currentPoolResult;
		if (poolRows.length === EMPTY_ARRAY_LENGTH) {
			throw new Error(`Pool with ID ${poolId} not found`);
		}

		const [{ pool_key: oldPoolKey }] = poolRows;

		// Build dynamic update query using helper
		const { clauses: setClauses, values } = buildPoolUpdateClauses(
			updates,
			poolId,
		);

		// Check for pool key conflict if changing
		if (newPoolKey !== undefined) {
			const existingPool = await tx.query<{ id: number }>(
				"SELECT id FROM pools WHERE pool_key = :newPoolKey AND id != :poolId",
				{ newPoolKey, poolId },
			);
			if (existingPool.rows.length > EMPTY_ARRAY_LENGTH) {
				throw new Error(`Pool key ${newPoolKey} already exists`);
			}
		}

		if (setClauses.length === EMPTY_ARRAY_LENGTH) {
			throw new Error("No fields to update");
		}

		setClauses.push("updated_at = NOW()");

		// Update the pool
		const result = await tx.query<PoolDbRow>(
			`UPDATE pools SET ${setClauses.join(", ")} WHERE id = :poolId RETURNING *`,
			values,
		);

		const pool = mapRowToPool(result.rows[FIRST_ROW]);

		// Resolve pending assignments if pool key was changed
		if (newPoolKey === undefined || newPoolKey === oldPoolKey) {
			return { pool, resolvedUsers: 0 };
		}

		const keysToResolve = [oldPoolKey, newPoolKey];
		const resolvedUsers = await resolvePendingPoolAssignments(
			tx,
			poolId,
			keysToResolve,
		);

		return { pool, resolvedUsers };
	});
}

/**
 * Disable a pool
 */
export async function disablePool(poolId: number): Promise<Pool> {
	const result = await db.query<PoolDbRow>(
		`UPDATE pools
     SET is_disabled = TRUE, updated_at = NOW()
     WHERE id = :poolId
     RETURNING *`,
		{ poolId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Pool with ID ${poolId} not found`);
	}

	return mapRowToPool(result.rows[FIRST_ROW]);
}

/**
 * Enable a pool
 */
export async function enablePool(poolId: number): Promise<Pool> {
	const result = await db.query<PoolDbRow>(
		`UPDATE pools
     SET is_disabled = FALSE, updated_at = NOW()
     WHERE id = :poolId
     RETURNING *`,
		{ poolId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		throw new Error(`Pool with ID ${poolId} not found`);
	}

	return mapRowToPool(result.rows[FIRST_ROW]);
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
		is_meeting_admin: boolean;
		is_disabled: boolean;
		created_at: Date;
		updated_at: Date;
	}>(
		`SELECT u.id, u.username, u.voter_id, u.first_name, u.last_name,
            u.is_admin, u.is_watcher, u.is_meeting_admin, u.is_disabled, u.created_at, u.updated_at
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
		isMeetingAdmin: row.is_meeting_admin,
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
	const result = await db.query<PoolDbRow>(
		`SELECT p.*
     FROM pools p
     INNER JOIN user_pools up ON p.id = up.pool_id
     WHERE up.user_id = :userId
     ORDER BY p.created_at DESC`,
		{ userId },
	);

	return result.rows.map(mapRowToPool);
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
 * Uses a transaction to ensure atomicity - either all associations update or none do
 *
 * IMPORTANT: This function validates pool keys BEFORE deleting existing associations
 * to prevent data loss when invalid pool keys are provided.
 *
 * @param userId - The user ID to set pools for
 * @param poolKeys - Array of pool keys to associate with the user
 * @param existingTx - Optional existing transaction context (reuses caller's transaction)
 * @returns Object with validPoolCount and invalidPoolKeys for caller to handle warnings
 */
export async function setUserPools(
	userId: string,
	poolKeys: string[],
	existingTx?: TinyPg,
): Promise<{ validPoolCount: number; invalidPoolKeys: string[] }> {
	// Helper function containing the actual logic
	const doSetPools = async (
		tx: TinyPg,
	): Promise<{ validPoolCount: number; invalidPoolKeys: string[] }> => {
		// If no pools to add, just clear existing associations
		if (poolKeys.length === EMPTY_ARRAY_LENGTH) {
			await tx.query("DELETE FROM user_pools WHERE user_id = :userId", {
				userId,
			});
			return { validPoolCount: 0, invalidPoolKeys: [] };
		}

		// FIRST: Validate pool keys exist BEFORE deleting anything
		const poolResult = await tx.query<{ id: number; pool_key: string }>(
			`SELECT id, pool_key FROM pools WHERE pool_key = ANY(:poolKeys)`,
			{ poolKeys },
		);

		// Identify which pool keys are invalid
		const foundPoolKeys = new Set(poolResult.rows.map((row) => row.pool_key));
		const invalidPoolKeys = poolKeys.filter((key) => !foundPoolKeys.has(key));

		// Record invalid pool keys as pending for later resolution
		if (invalidPoolKeys.length > EMPTY_ARRAY_LENGTH) {
			await recordPendingPoolKeys(userId, invalidPoolKeys, tx);
		}

		// If ALL pool keys are invalid, do NOT delete existing associations
		// This prevents accidental data loss from typos or missing pools
		if (poolResult.rows.length === EMPTY_ARRAY_LENGTH) {
			return { validPoolCount: 0, invalidPoolKeys };
		}

		// NOW it's safe to delete existing associations since we have valid pools to add
		await tx.query("DELETE FROM user_pools WHERE user_id = :userId", {
			userId,
		});

		// Build batch insert values
		const poolIds = poolResult.rows.map((row) => row.id);

		// Insert all associations in a single query using UNNEST
		await tx.query(
			`INSERT INTO user_pools (user_id, pool_id)
       SELECT :userId, unnest(:poolIds::int[])
       ON CONFLICT (user_id, pool_id) DO NOTHING`,
			{ userId, poolIds },
		);

		return { validPoolCount: poolIds.length, invalidPoolKeys };
	};

	// Use existing transaction if provided, otherwise create a new one
	if (existingTx === undefined) {
		return await withTransaction(doSetPools);
	}
	return await doSetPools(existingTx);
}

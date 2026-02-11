/**
 * Pending pool key management service
 * Tracks and resolves pool keys from CSV imports that don't match existing pools
 */
import { db, withTransaction } from "../database/db.js";
import { createPool, addUserToPool, getPoolById } from "./pool-service.js";
import type { TinyPg } from "tinypg";
import type {
	PendingPoolKey,
	ResolvePendingPoolResponse,
} from "@mcdc-convention-voting/shared";

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
 * Record pending pool keys for a user during CSV import
 * Called when setUserPools() encounters invalid pool keys
 *
 * @param userId - The user ID
 * @param invalidPoolKeys - Array of pool key strings that were not found
 * @param existingTx - Optional transaction context
 */
export async function recordPendingPoolKeys(
	userId: string,
	invalidPoolKeys: string[],
	existingTx?: TinyPg,
): Promise<void> {
	if (invalidPoolKeys.length === EMPTY_ARRAY_LENGTH) {
		return;
	}

	const doRecord = async (tx: TinyPg): Promise<void> => {
		// Insert pending pool keys, ignoring duplicates
		await tx.query(
			`INSERT INTO pending_pool_keys (user_id, pool_key)
       SELECT :userId, unnest(:poolKeys::text[])
       ON CONFLICT (user_id, pool_key) DO NOTHING`,
			{ userId, poolKeys: invalidPoolKeys },
		);
	};

	if (existingTx === undefined) {
		await withTransaction(doRecord);
	} else {
		await doRecord(existingTx);
	}
}

/**
 * List pending pool keys with aggregated user counts
 */
export async function listPendingPoolKeys(
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ pendingKeys: PendingPoolKey[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	// Get total count of distinct pool keys
	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(DISTINCT pool_key) as count FROM pending_pool_keys",
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	// Get paginated pending keys with user counts
	const result = await db.query<{
		pool_key: string;
		user_count: string;
		first_seen_at: Date;
	}>(
		`SELECT
       pool_key,
       COUNT(user_id)::text as user_count,
       MIN(created_at) as first_seen_at
     FROM pending_pool_keys
     GROUP BY pool_key
     ORDER BY COUNT(user_id) DESC, pool_key ASC
     LIMIT :limit OFFSET :offset`,
		{ limit, offset },
	);

	const pendingKeys = result.rows.map((row) => ({
		poolKey: row.pool_key,
		userCount: parseInt(row.user_count, DECIMAL_RADIX),
		firstSeenAt: row.first_seen_at,
	}));

	return { pendingKeys, total };
}

/**
 * Get users associated with a specific pending pool key
 */
export async function getUsersForPendingPoolKey(
	poolKey: string,
	page = DEFAULT_PAGE,
	limit = DEFAULT_LIMIT,
): Promise<{ userIds: string[]; total: number }> {
	const offset = (page - PAGE_OFFSET_ADJUSTMENT) * limit;

	const countResult = await db.query<{ count: string }>(
		"SELECT COUNT(*) as count FROM pending_pool_keys WHERE pool_key = :poolKey",
		{ poolKey },
	);
	const total = parseInt(countResult.rows[FIRST_ROW].count, DECIMAL_RADIX);

	const result = await db.query<{ user_id: string }>(
		`SELECT user_id FROM pending_pool_keys
     WHERE pool_key = :poolKey
     ORDER BY created_at ASC
     LIMIT :limit OFFSET :offset`,
		{ poolKey, limit, offset },
	);

	return {
		userIds: result.rows.map((row) => row.user_id),
		total,
	};
}

/**
 * Resolve pending pool keys by creating a new pool and associating users
 *
 * @param poolKey - The pending pool key to resolve
 * @param poolName - Display name for the new pool
 * @param description - Optional description
 */
export async function resolvePendingByCreatingPool(
	poolKey: string,
	poolName: string,
	description?: string,
): Promise<ResolvePendingPoolResponse> {
	return await withTransaction(async (tx) => {
		// Create the new pool
		const pool = await createPool({ poolKey, poolName, description });

		// Get all users with this pending pool key
		const usersResult = await tx.query<{ user_id: string }>(
			"SELECT user_id FROM pending_pool_keys WHERE pool_key = :poolKey",
			{ poolKey },
		);

		// Add each user to the new pool
		for (const { user_id: userId } of usersResult.rows) {
			// eslint-disable-next-line no-await-in-loop -- Sequential within transaction
			await addUserToPool(pool.id, userId);
		}

		// Delete the pending pool key records
		await tx.query("DELETE FROM pending_pool_keys WHERE pool_key = :poolKey", {
			poolKey,
		});

		return {
			usersUpdated: usersResult.rows.length,
			pool,
		};
	});
}

/**
 * Resolve pending pool keys by remapping users to an existing pool
 *
 * @param pendingPoolKey - The pending pool key to resolve
 * @param targetPoolId - The existing pool to add users to
 */
export async function resolvePendingByRemapping(
	pendingPoolKey: string,
	targetPoolId: number,
): Promise<ResolvePendingPoolResponse> {
	return await withTransaction(async (tx) => {
		// Verify target pool exists
		const pool = await getPoolById(targetPoolId);

		if (pool === null) {
			throw new Error(`Pool with ID ${targetPoolId} not found`);
		}

		// Get all users with this pending pool key
		const usersResult = await tx.query<{ user_id: string }>(
			"SELECT user_id FROM pending_pool_keys WHERE pool_key = :pendingPoolKey",
			{ pendingPoolKey },
		);

		// Add each user to the target pool (ON CONFLICT DO NOTHING handles existing associations)
		for (const { user_id: userId } of usersResult.rows) {
			// eslint-disable-next-line no-await-in-loop -- Sequential within transaction
			await addUserToPool(pool.id, userId);
		}

		// Delete the pending pool key records
		await tx.query(
			"DELETE FROM pending_pool_keys WHERE pool_key = :pendingPoolKey",
			{ pendingPoolKey },
		);

		return {
			usersUpdated: usersResult.rows.length,
			pool,
		};
	});
}

/**
 * Delete all pending records for a specific pool key without resolving
 * (Admin decided to ignore/discard these)
 */
export async function deletePendingPoolKey(poolKey: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		`WITH deleted AS (
       DELETE FROM pending_pool_keys WHERE pool_key = :poolKey
       RETURNING *
     )
     SELECT COUNT(*)::text as count FROM deleted`,
		{ poolKey },
	);
	return parseInt(result.rows[FIRST_ROW].count, DECIMAL_RADIX);
}

/**
 * Check if a pool key is pending (has any records)
 */
export async function isPendingPoolKey(poolKey: string): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		"SELECT EXISTS(SELECT 1 FROM pending_pool_keys WHERE pool_key = :poolKey) as exists",
		{ poolKey },
	);
	return result.rows[FIRST_ROW].exists;
}

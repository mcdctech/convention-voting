/**
 * Activity logging service for quorum tracking
 *
 * Logs authenticated user activity for later association with meetings
 * at query time via user IDs and timestamps.
 */
import { db } from "../database/db.js";
import type { ActivityLog } from "@mcdc-convention-voting/shared";

// Array index constants
const FIRST_ROW = 0;
const SLICE_START = 0;

// URL path limits
const MAX_URL_PATH_LENGTH = 500;

// Default pagination
const DEFAULT_ACTIVITY_LIMIT = 100;

/**
 * Log user activity for quorum tracking
 *
 * Simply inserts a record with user ID, URL path, and timestamp.
 * Activity is associated with meetings at query time, not at insert time.
 */
export async function logActivity(
	userId: string,
	urlPath: string,
): Promise<void> {
	// Truncate URL path if necessary (to fit in VARCHAR(500))
	const truncatedPath = urlPath.slice(SLICE_START, MAX_URL_PATH_LENGTH);

	await db.query(
		`INSERT INTO activity_logs (user_id, url_path)
		 VALUES (:userId, :urlPath)`,
		{ userId, urlPath: truncatedPath },
	);
}

/**
 * Get activity logs for a user within a time range
 *
 * Used for debugging and detailed quorum views.
 */
export async function getActivityLogsForUser(
	userId: string,
	startDate: Date,
	endDate: Date,
	limit = DEFAULT_ACTIVITY_LIMIT,
): Promise<ActivityLog[]> {
	const result = await db.query<{
		id: number;
		user_id: string;
		url_path: string;
		created_at: Date;
	}>(
		`SELECT id, user_id, url_path, created_at
		 FROM activity_logs
		 WHERE user_id = :userId
		   AND created_at >= :startDate
		   AND created_at <= :endDate
		 ORDER BY created_at DESC
		 LIMIT :limit`,
		{ userId, startDate, endDate, limit },
	);

	return result.rows.map((row) => ({
		id: row.id,
		userId: row.user_id,
		urlPath: row.url_path,
		createdAt: row.created_at,
	}));
}

/**
 * Count distinct active users within a time range who are in a specific pool
 *
 * Used for quorum calculation - counts users from the quorum pool
 * who had any activity during the meeting time window.
 */
export async function countActiveUsersInPool(
	poolId: number,
	startDate: Date,
	endDate: Date,
): Promise<number> {
	const result = await db.query<{ count: string }>(
		`SELECT COUNT(DISTINCT al.user_id) as count
		 FROM activity_logs al
		 INNER JOIN user_pools up ON al.user_id = up.user_id
		 WHERE up.pool_id = :poolId
		   AND al.created_at >= :startDate
		   AND al.created_at <= :endDate`,
		{ poolId, startDate, endDate },
	);

	return parseInt(result.rows[FIRST_ROW].count, 10);
}

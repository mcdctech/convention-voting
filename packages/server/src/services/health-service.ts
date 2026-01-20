/**
 * Health check service for verifying system health
 */
import { db } from "../database/db.js";

/**
 * Status of an individual health check
 */
type HealthCheckStatus = "healthy" | "unhealthy";

/**
 * Overall system health status
 */
type SystemHealthStatus = "healthy" | "unhealthy";

/**
 * Result of a single health check
 */
interface HealthCheckResult {
	status: HealthCheckStatus;
	responseTimeMs: number;
	error?: string;
}

/**
 * Complete health check response
 */
export interface HealthResponse {
	status: SystemHealthStatus;
	timestamp: string;
	checks?: {
		database: HealthCheckResult;
	};
}

/**
 * Check database connectivity by executing a simple query
 * Returns the result with timing information
 *
 * Note: Timeout is handled by the database driver's connection settings
 */
async function checkDatabaseHealth(): Promise<HealthCheckResult> {
	const startTime = performance.now();

	try {
		await db.query("SELECT 1");

		const responseTimeMs = Math.round(performance.now() - startTime);

		return {
			status: "healthy",
			responseTimeMs,
		};
	} catch (error) {
		const responseTimeMs = Math.round(performance.now() - startTime);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown database error";

		return {
			status: "unhealthy",
			responseTimeMs,
			error: errorMessage,
		};
	}
}

/**
 * Perform a shallow health check (no external dependencies)
 * Used for fast liveness probes
 */
export function getShallowHealth(): HealthResponse {
	return {
		status: "healthy",
		timestamp: new Date().toISOString(),
	};
}

/**
 * Perform a deep health check including database connectivity
 * Used for readiness probes and comprehensive health verification
 */
export async function getDeepHealth(): Promise<HealthResponse> {
	const databaseResult = await checkDatabaseHealth();

	const isHealthy = databaseResult.status === "healthy";

	return {
		status: isHealthy ? "healthy" : "unhealthy",
		timestamp: new Date().toISOString(),
		checks: {
			database: databaseResult,
		},
	};
}

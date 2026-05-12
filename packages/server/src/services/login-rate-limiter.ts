/**
 * Login rate limiter service
 *
 * Implements per-username rate limiting to prevent brute-force attacks.
 * Uses in-memory storage (acceptable for convention voting context).
 */
import pino from "pino";

const logger = pino({ name: "login-rate-limiter" });

/**
 * Track login attempt state for a username
 */
interface LoginAttemptState {
	failureCount: number;
	firstFailureAt: number;
	lockedUntil: number | null;
}

/**
 * Result of checking if a user is rate limited
 */
export interface RateLimitCheckResult {
	isLocked: boolean;
	retryAfterMs: number | null;
}

// In-memory store keyed by normalized username (lowercase)
const loginAttempts = new Map<string, LoginAttemptState>();

// Time constants
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const MINUTES_15 = 15;
const MINUTES_5 = 5;
const MINUTES_1 = 1;

// Failure thresholds
const THRESHOLD_TIER_1 = 5;
const THRESHOLD_TIER_2 = 10;
const THRESHOLD_TIER_3 = 15;

// Time window for counting failures (15 minutes)
const FAILURE_WINDOW_MS =
	MINUTES_15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

// Lockout durations
const LOCKOUT_TIER_1_MS =
	MINUTES_1 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND; // 1 minute
const LOCKOUT_TIER_2_MS =
	MINUTES_5 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND; // 5 minutes
const LOCKOUT_TIER_3_MS =
	MINUTES_15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND; // 15 minutes

// Cleanup interval (run every 5 minutes)
const CLEANUP_INTERVAL_MS =
	MINUTES_5 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

// Lockout thresholds - escalating lockout durations
const LOCKOUT_THRESHOLDS = [
	{ failures: THRESHOLD_TIER_1, lockoutMs: LOCKOUT_TIER_1_MS },
	{ failures: THRESHOLD_TIER_2, lockoutMs: LOCKOUT_TIER_2_MS },
	{ failures: THRESHOLD_TIER_3, lockoutMs: LOCKOUT_TIER_3_MS },
];

// Initial failure count
const INITIAL_FAILURE_COUNT = 1;

// No lockout duration
const NO_LOCKOUT = 0;

/**
 * Normalize username for consistent lookup
 */
function normalizeUsername(username: string): string {
	return username.toLowerCase().trim();
}

/**
 * Get the appropriate lockout duration based on failure count
 */
function getLockoutDuration(failureCount: number): number {
	// Find the highest threshold that applies
	let lockoutMs = NO_LOCKOUT;
	for (const { failures, lockoutMs: duration } of LOCKOUT_THRESHOLDS) {
		if (failureCount >= failures) {
			lockoutMs = duration;
		}
	}
	return lockoutMs;
}

/**
 * Check if a username is currently rate limited
 *
 * IMPORTANT: Call this BEFORE validating credentials to prevent timing attacks
 */
export function checkRateLimit(username: string): RateLimitCheckResult {
	const normalizedUsername = normalizeUsername(username);
	const state = loginAttempts.get(normalizedUsername);
	const now = Date.now();

	if (state === undefined) {
		return { isLocked: false, retryAfterMs: null };
	}

	// Check if currently locked
	if (state.lockedUntil !== null && now < state.lockedUntil) {
		const retryAfterMs = state.lockedUntil - now;
		return { isLocked: true, retryAfterMs };
	}

	// Lock has expired - clear it
	if (state.lockedUntil !== null && now >= state.lockedUntil) {
		state.lockedUntil = null;
	}

	return { isLocked: false, retryAfterMs: null };
}

/**
 * Record a failed login attempt for a username
 *
 * Returns the rate limit status after recording the failure
 */
export function recordFailedLogin(username: string): RateLimitCheckResult {
	const normalizedUsername = normalizeUsername(username);
	const now = Date.now();

	let state = loginAttempts.get(normalizedUsername);

	if (state === undefined) {
		// First failure for this username
		state = {
			failureCount: INITIAL_FAILURE_COUNT,
			firstFailureAt: now,
			lockedUntil: null,
		};
		loginAttempts.set(normalizedUsername, state);
		logger.debug(
			{ username: normalizedUsername },
			"First failed login attempt",
		);
		return { isLocked: false, retryAfterMs: null };
	}

	// Check if we're outside the failure window - reset if so
	if (now - state.firstFailureAt > FAILURE_WINDOW_MS) {
		state.failureCount = INITIAL_FAILURE_COUNT;
		state.firstFailureAt = now;
		state.lockedUntil = null;
		logger.debug(
			{ username: normalizedUsername },
			"Reset failure count (outside window)",
		);
		return { isLocked: false, retryAfterMs: null };
	}

	// Increment failure count
	state.failureCount += INITIAL_FAILURE_COUNT;

	// Check if we need to apply a lockout
	const lockoutMs = getLockoutDuration(state.failureCount);
	if (lockoutMs > NO_LOCKOUT) {
		state.lockedUntil = now + lockoutMs;
		logger.warn(
			{
				username: normalizedUsername,
				failureCount: state.failureCount,
				lockoutMs,
			},
			"Username locked due to too many failed attempts",
		);
		return { isLocked: true, retryAfterMs: lockoutMs };
	}

	logger.debug(
		{ username: normalizedUsername, failureCount: state.failureCount },
		"Failed login attempt recorded",
	);
	return { isLocked: false, retryAfterMs: null };
}

/**
 * Record a successful login - resets the failure count
 */
export function recordSuccessfulLogin(username: string): void {
	const normalizedUsername = normalizeUsername(username);
	const state = loginAttempts.get(normalizedUsername);

	if (state !== undefined) {
		logger.debug(
			{
				username: normalizedUsername,
				previousFailures: state.failureCount,
			},
			"Successful login - resetting failure count",
		);
		loginAttempts.delete(normalizedUsername);
	}
}

/**
 * Clean up expired entries to prevent memory leaks
 *
 * Removes entries where:
 * - The failure window has expired AND no active lock
 * - The lock has expired
 */
export function cleanupExpiredAttempts(): number {
	const now = Date.now();
	let cleanedCount = 0;

	for (const [username, state] of loginAttempts.entries()) {
		const windowExpired = now - state.firstFailureAt > FAILURE_WINDOW_MS;
		const lockExpired = state.lockedUntil === null || now >= state.lockedUntil;

		if (windowExpired && lockExpired) {
			loginAttempts.delete(username);
			cleanedCount += INITIAL_FAILURE_COUNT;
		}
	}

	if (cleanedCount > NO_LOCKOUT) {
		logger.debug({ cleanedCount }, "Cleaned up expired login attempts");
	}

	return cleanedCount;
}

/**
 * Get current state for testing/debugging purposes
 */
export function getAttemptState(
	username: string,
): LoginAttemptState | undefined {
	return loginAttempts.get(normalizeUsername(username));
}

/**
 * Clear all state - for testing purposes only
 */
export function clearAllState(): void {
	loginAttempts.clear();
}

// Start periodic cleanup
const cleanupInterval = setInterval(
	cleanupExpiredAttempts,
	CLEANUP_INTERVAL_MS,
);

// Allow cleanup interval to be cleared for graceful shutdown
export function stopCleanupInterval(): void {
	clearInterval(cleanupInterval);
}

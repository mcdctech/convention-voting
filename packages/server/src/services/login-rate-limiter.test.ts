/**
 * Unit tests for login-rate-limiter service
 *
 * Tests the per-username rate limiting functionality to prevent brute-force attacks.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
	checkRateLimit,
	recordFailedLogin,
	recordSuccessfulLogin,
	cleanupExpiredAttempts,
	getAttemptState,
	clearAllState,
	stopCleanupInterval,
} from "./login-rate-limiter.js";

describe("login-rate-limiter", () => {
	beforeEach(() => {
		// Clear all state before each test
		clearAllState();
		// Use fake timers for time-dependent tests
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("checkRateLimit", () => {
		it("should return not locked for new username", () => {
			const result = checkRateLimit("newuser");

			expect(result.isLocked).toBe(false);
			expect(result.retryAfterMs).toBeNull();
		});

		it("should return not locked when user has failures but below threshold", () => {
			// Record 4 failures (below threshold of 5)
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");

			const result = checkRateLimit("testuser");

			expect(result.isLocked).toBe(false);
			expect(result.retryAfterMs).toBeNull();
		});

		it("should return locked when user has reached lockout threshold", () => {
			// Record 5 failures (triggers tier 1 lockout)
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("testuser");
			}

			const result = checkRateLimit("testuser");

			expect(result.isLocked).toBe(true);
			expect(result.retryAfterMs).toBeGreaterThan(0);
		});

		it("should normalize username to lowercase", () => {
			// Record failures with uppercase
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("TestUser");
			}

			// Check with lowercase - should be locked
			const result = checkRateLimit("testuser");

			expect(result.isLocked).toBe(true);
		});

		it("should trim whitespace from username", () => {
			// Record failures with whitespace
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("  testuser  ");
			}

			// Check without whitespace - should be locked
			const result = checkRateLimit("testuser");

			expect(result.isLocked).toBe(true);
		});
	});

	describe("recordFailedLogin", () => {
		it("should return not locked for first failure", () => {
			const result = recordFailedLogin("testuser");

			expect(result.isLocked).toBe(false);
			expect(result.retryAfterMs).toBeNull();
		});

		it("should track failure count", () => {
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");

			const state = getAttemptState("testuser");

			expect(state?.failureCount).toBe(3);
		});

		it("should trigger tier 1 lockout (1 minute) at 5 failures", () => {
			// Record 4 failures - no lockout yet
			for (let i = 0; i < 4; i += 1) {
				const result = recordFailedLogin("testuser");
				expect(result.isLocked).toBe(false);
			}

			// 5th failure triggers lockout
			const result = recordFailedLogin("testuser");

			expect(result.isLocked).toBe(true);
			// 1 minute = 60000 ms
			expect(result.retryAfterMs).toBe(60000);
		});

		it("should trigger tier 2 lockout (5 minutes) at 10 failures", () => {
			// Record 9 failures
			for (let i = 0; i < 9; i += 1) {
				recordFailedLogin("testuser");
			}

			// Wait for tier 1 lock to expire, then record 10th
			vi.advanceTimersByTime(60001);

			const result = recordFailedLogin("testuser");

			expect(result.isLocked).toBe(true);
			// 5 minutes = 300000 ms
			expect(result.retryAfterMs).toBe(300000);
		});

		it("should trigger tier 3 lockout (15 minutes) at 15 failures", () => {
			// Record 14 failures
			for (let i = 0; i < 14; i += 1) {
				recordFailedLogin("testuser");
			}

			// Wait for tier 2 lock to expire, then record 15th
			vi.advanceTimersByTime(300001);

			const result = recordFailedLogin("testuser");

			expect(result.isLocked).toBe(true);
			// 15 minutes = 900000 ms
			expect(result.retryAfterMs).toBe(900000);
		});

		it("should reset failure count after failure window expires", () => {
			// Record some failures
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");

			// Advance time past 15 minute window
			vi.advanceTimersByTime(15 * 60 * 1000 + 1);

			// Record new failure - should reset to 1
			recordFailedLogin("testuser");

			const state = getAttemptState("testuser");

			expect(state?.failureCount).toBe(1);
		});
	});

	describe("recordSuccessfulLogin", () => {
		it("should clear failure state for username", () => {
			// Record some failures
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");
			recordFailedLogin("testuser");

			// Successful login
			recordSuccessfulLogin("testuser");

			const state = getAttemptState("testuser");

			expect(state).toBeUndefined();
		});

		it("should not throw for username with no previous state", () => {
			expect(() => {
				recordSuccessfulLogin("newuser");
			}).not.toThrow();
		});

		it("should normalize username when clearing state", () => {
			// Record failures with lowercase
			for (let i = 0; i < 3; i += 1) {
				recordFailedLogin("testuser");
			}

			// Successful login with uppercase
			recordSuccessfulLogin("TESTUSER");

			// State should be cleared
			const state = getAttemptState("testuser");

			expect(state).toBeUndefined();
		});
	});

	describe("cleanupExpiredAttempts", () => {
		it("should remove expired entries", () => {
			// Record failures for two users
			recordFailedLogin("user1");
			recordFailedLogin("user2");

			// Advance time past failure window
			vi.advanceTimersByTime(15 * 60 * 1000 + 1);

			const cleanedCount = cleanupExpiredAttempts();

			expect(cleanedCount).toBe(2);
			expect(getAttemptState("user1")).toBeUndefined();
			expect(getAttemptState("user2")).toBeUndefined();
		});

		it("should not remove entries within failure window", () => {
			recordFailedLogin("testuser");

			// Advance time but stay within window
			vi.advanceTimersByTime(10 * 60 * 1000);

			const cleanedCount = cleanupExpiredAttempts();

			expect(cleanedCount).toBe(0);
			expect(getAttemptState("testuser")).toBeDefined();
		});

		it("should not remove entries with active lockout", () => {
			// Trigger a tier 1 lockout (5 failures = 1 minute lockout)
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("testuser");
			}

			// Advance by 30 seconds - lockout still active (1 minute)
			vi.advanceTimersByTime(30 * 1000);

			const cleanedCount = cleanupExpiredAttempts();

			// Entry should not be cleaned because lockout is still active
			expect(cleanedCount).toBe(0);
			expect(getAttemptState("testuser")).toBeDefined();
		});
	});

	describe("lockout expiration", () => {
		it("should unlock after tier 1 lockout expires", () => {
			// Trigger tier 1 lockout (5 failures = 1 minute)
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("testuser");
			}

			// Verify locked
			expect(checkRateLimit("testuser").isLocked).toBe(true);

			// Advance time past lockout
			vi.advanceTimersByTime(60001);

			// Should be unlocked now
			expect(checkRateLimit("testuser").isLocked).toBe(false);
		});

		it("should clear lockout state when checking after expiry", () => {
			// Trigger lockout
			for (let i = 0; i < 5; i += 1) {
				recordFailedLogin("testuser");
			}

			const state = getAttemptState("testuser");
			expect(state?.lockedUntil).not.toBeNull();

			// Advance time past lockout and check
			vi.advanceTimersByTime(60001);
			checkRateLimit("testuser");

			// lockedUntil should be cleared
			const newState = getAttemptState("testuser");
			expect(newState?.lockedUntil).toBeNull();
		});
	});

	describe("cleanup interval", () => {
		it("should export stopCleanupInterval for graceful shutdown", () => {
			expect(typeof stopCleanupInterval).toBe("function");
		});
	});
});

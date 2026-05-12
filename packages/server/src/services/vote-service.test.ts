/**
 * Unit tests for vote-service
 *
 * These tests verify the SQL patterns and logic used in vote operations.
 * The database is mocked to test query structure and result handling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks require type assertions */
/* eslint-disable @typescript-eslint/unbound-method -- db.query mock is safe to use unbound in tests */
/* eslint-disable import/order -- vi.mock must be called before importing mocked modules */
/* eslint-disable @typescript-eslint/prefer-destructuring -- Dynamic array access is clearer for mock.calls */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the database module before importing vote-service
vi.mock("../database/db.js", () => ({
	db: {
		query: vi.fn(),
	},
}));

// Mock the ServiceError import
vi.mock("../errors/service-error.js", () => ({
	ServiceError: class ServiceError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));

// Import after mocking
import { db } from "../database/db.js";
import { hasUserVoted, isUserInVotingPool, castVote } from "./vote-service.js";

describe("vote-service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("hasUserVoted", () => {
		it("should return true when user has voted (EXISTS returns true)", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: true }],
			});

			const result = await hasUserVoted("user-123", 1);

			expect(result).toBe(true);
			expect(mockQuery).toHaveBeenCalledTimes(1);

			// Verify the query uses EXISTS pattern
			const firstCall = mockQuery.mock.calls[0] as [string, unknown];
			const [query] = firstCall;
			expect(query).toContain("EXISTS");
			expect(query).toContain("SELECT 1");
		});

		it("should return false when user has not voted (EXISTS returns false)", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: false }],
			});

			const result = await hasUserVoted("user-456", 2);

			expect(result).toBe(false);
			expect(mockQuery).toHaveBeenCalledTimes(1);
		});

		it("should pass correct parameters to query", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: false }],
			});

			await hasUserVoted("test-user-id", 42);

			const firstCall = mockQuery.mock.calls[0] as [
				string,
				{ userId: string; motionId: number },
			];
			const [, params] = firstCall;
			expect(params.userId).toBe("test-user-id");
			expect(params.motionId).toBe(42);
		});
	});

	describe("isUserInVotingPool", () => {
		it("should return true when user is in voting pool (EXISTS returns true)", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: true }],
			});

			const result = await isUserInVotingPool("user-123", 1);

			expect(result).toBe(true);
			expect(mockQuery).toHaveBeenCalledTimes(1);

			// Verify the query uses EXISTS pattern
			const firstCall = mockQuery.mock.calls[0] as [string, unknown];
			const [query] = firstCall;
			expect(query).toContain("EXISTS");
			expect(query).toContain("SELECT 1");
		});

		it("should return false when user is not in voting pool (EXISTS returns false)", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: false }],
			});

			const result = await isUserInVotingPool("user-456", 2);

			expect(result).toBe(false);
			expect(mockQuery).toHaveBeenCalledTimes(1);
		});

		it("should handle COALESCE for motion vs meeting pool", async () => {
			const mockQuery = db.query as Mock;
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: true }],
			});

			await isUserInVotingPool("user-123", 1);

			// Verify query uses COALESCE to check motion pool first, then meeting pool
			const firstCall = mockQuery.mock.calls[0] as [string, unknown];
			const [query] = firstCall;
			expect(query).toContain("COALESCE");
			expect(query).toContain("voting_pool_id");
			expect(query).toContain("quorum_voting_pool_id");
		});
	});

	describe("castVote - batch insert", () => {
		it("should use batch UNNEST for multiple choice inserts", async () => {
			const mockQuery = db.query as Mock;

			// Mock getMotionForVoting internal calls
			// 1. Motion query
			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 1,
						name: "Test Motion",
						description: null,
						planned_duration: 5,
						selection_count: 3,
						status: "voting_active",
						pool_name: "Test Pool",
						meeting_id: 1,
						meeting_name: "Test Meeting",
						end_override: null,
						voting_started_at: new Date(),
					},
				],
			});

			// 2. Choices query
			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 10,
						motion_id: 1,
						name: "Choice A",
						sort_order: 0,
						created_at: new Date(),
						updated_at: new Date(),
					},
					{
						id: 11,
						motion_id: 1,
						name: "Choice B",
						sort_order: 1,
						created_at: new Date(),
						updated_at: new Date(),
					},
					{
						id: 12,
						motion_id: 1,
						name: "Choice C",
						sort_order: 2,
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			});

			// 3. hasUserVoted (EXISTS)
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: false }],
			});

			// 4. isUserInVotingPool (EXISTS)
			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: true }],
			});

			// 5. Insert vote
			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 100,
						user_id: "user-123",
						motion_id: 1,
						is_abstain: false,
						created_at: new Date(),
					},
				],
			});

			// 6. Batch insert vote_choices (the key test)
			mockQuery.mockResolvedValueOnce({ rows: [] });

			await castVote("user-123", 1, {
				choiceIds: [10, 11, 12],
				abstain: false,
			});

			// The last query should be the batch insert
			const { length: callCount } = mockQuery.mock.calls;
			const lastCall = mockQuery.mock.calls[callCount - 1] as [
				string,
				{ voteId: number; choiceIds: number[] },
			];
			const [query, params] = lastCall;

			// Verify batch insert uses UNNEST
			expect(query).toContain("UNNEST");
			expect(query).toContain("INSERT INTO vote_choices");
			expect(params.voteId).toBe(100);
			expect(params.choiceIds).toEqual([10, 11, 12]);
		});

		it("should not insert vote_choices when abstaining", async () => {
			const mockQuery = db.query as Mock;

			// Mock getMotionForVoting internal calls
			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 1,
						name: "Test Motion",
						description: null,
						planned_duration: 5,
						selection_count: 1,
						status: "voting_active",
						pool_name: "Test Pool",
						meeting_id: 1,
						meeting_name: "Test Meeting",
						end_override: null,
						voting_started_at: new Date(),
					},
				],
			});

			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 10,
						motion_id: 1,
						name: "Choice A",
						sort_order: 0,
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			});

			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: false }],
			});

			mockQuery.mockResolvedValueOnce({
				rows: [{ exists: true }],
			});

			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						id: 100,
						user_id: "user-123",
						motion_id: 1,
						is_abstain: true,
						created_at: new Date(),
					},
				],
			});

			await castVote("user-123", 1, {
				choiceIds: [],
				abstain: true,
			});

			// Should have exactly 5 queries (no vote_choices insert)
			expect(mockQuery).toHaveBeenCalledTimes(5);

			// Verify no UNNEST/vote_choices query was made
			const allQueries = mockQuery.mock.calls.map(
				(call) => (call as [string, unknown])[0],
			);
			const voteChoicesInserts = allQueries.filter((q) =>
				q.includes("vote_choices"),
			);
			expect(voteChoicesInserts).toHaveLength(0);
		});
	});
});

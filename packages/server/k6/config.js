/**
 * k6 Load Test Configuration
 *
 * Configuration for load testing against https://win.mcdems.us
 */

// Target URL - production
export const BASE_URL = __ENV.BASE_URL || "https://win.mcdems.us";
export const API_PREFIX = "/api";

// Test credentials - pass via environment variables for security
// Usage: k6 run -e VOTER_PASSWORD=yourpassword test.js
export const VOTER_PASSWORD = __ENV.VOTER_PASSWORD || "";
export const VOTER_PREFIX = __ENV.VOTER_PREFIX || "loadtest";
export const VOTER_COUNT = parseInt(__ENV.VOTER_COUNT || "1000", 10);

// Motion to test against - set this after creating test data
export const MOTION_ID = parseInt(__ENV.MOTION_ID || "0", 10);

// Thresholds for pass/fail criteria
export const THRESHOLDS = {
	// 95% of requests should complete within 500ms
	http_req_duration: ["p(95)<500"],
	// 99% of requests should complete within 1500ms
	http_req_duration_p99: ["p(99)<1500"],
	// Error rate should be less than 1%
	http_req_failed: ["rate<0.01"],
};

// Bell curve voting stages over 5 minutes
// Simulates realistic voting where most votes happen in the middle
export const VOTING_STAGES = [
	// Ramp up (0-1 min): Few early voters
	{ duration: "30s", target: 50 },
	{ duration: "30s", target: 150 },
	// Peak (1-3 min): Most voting activity
	{ duration: "30s", target: 300 },
	{ duration: "1m", target: 500 },
	{ duration: "30s", target: 300 },
	// Ramp down (3-5 min): Late voters
	{ duration: "30s", target: 150 },
	{ duration: "30s", target: 50 },
	{ duration: "30s", target: 10 },
];

// Smoke test - quick validation
export const SMOKE_STAGES = [
	{ duration: "30s", target: 5 },
	{ duration: "1m", target: 5 },
	{ duration: "30s", target: 0 },
];

// HTTP request defaults
export const HTTP_PARAMS = {
	headers: {
		"Content-Type": "application/json",
	},
	timeout: "30s",
};

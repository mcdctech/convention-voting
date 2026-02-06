/**
 * k6 Voting Simulation Test
 *
 * Simulates 1000 voters casting votes on a motion over 5 minutes
 * with a bell curve distribution (most votes in the middle).
 *
 * Prerequisites:
 *   1. Create test voter accounts and save credentials to voters.csv
 *   2. Create a test meeting with a motion
 *   3. Add the test voters to the motion's voting pool
 *   4. Start voting on the motion
 *
 * Usage:
 *   k6 run -e MOTION_ID=123 voting-simulation.js
 *   k6 run -e MOTION_ID=123 --out json=voting-results.json voting-simulation.js
 *
 * Environment Variables:
 *   MOTION_ID - ID of the motion to vote on (required)
 *
 * Required File:
 *   voters.csv - CSV file with columns: username,password
 */

import http from "k6/http";
import { check, sleep, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import papaparse from "https://jslib.k6.io/papaparse/5.1.1/index.js";
import {
	BASE_URL,
	API_PREFIX,
	MOTION_ID,
	VOTING_STAGES,
	THRESHOLDS,
	HTTP_PARAMS,
} from "./config.js";

// Load voter credentials from CSV file
// SharedArray ensures the data is loaded once and shared across all VUs
const voters = new SharedArray("voters", (() => {
	const csvData = open("./voters.csv");
	const parsed = papaparse.parse(csvData, {
		header: true,
		skipEmptyLines: true,
	});
	return parsed.data;
}));

// Custom metrics
const voteSuccessCounter = new Counter("votes_successful");
const voteFailedCounter = new Counter("votes_failed");
const voteAlreadyVotedCounter = new Counter("votes_already_voted");
const loginFailedCounter = new Counter("logins_failed");
const voteDuration = new Trend("vote_duration");
const voteSuccessRate = new Rate("vote_success_rate");

export const options = {
	stages: VOTING_STAGES,
	thresholds: {
		...THRESHOLDS,
		vote_success_rate: ["rate>0.95"], // 95% of vote attempts should succeed
		vote_duration: ["p(95)<400"], // 95% of votes should complete in 400ms
	},
	setupTimeout: "60s",
};

// Shared data for choices (fetched once in setup)
let choices = [];

export function setup() {
	// Validate required environment variables
	if (!MOTION_ID || MOTION_ID === 0) {
		fail("MOTION_ID environment variable is required");
	}

	// Validate voters loaded
	if (!voters || voters.length === 0) {
		fail(
			"No voters loaded from voters.csv. Ensure the file exists and has data.",
		);
	}

	console.log(`\nTest Configuration:`);
	console.log(`  Target: ${BASE_URL}`);
	console.log(`  Motion ID: ${MOTION_ID}`);
	console.log(`  Total voters loaded: ${voters.length}`);
	console.log(`\n`);

	// Login as first voter to fetch motion choices
	const firstVoter = voters[0];
	const loginRes = http.post(
		`${BASE_URL}${API_PREFIX}/auth/login`,
		JSON.stringify({
			username: firstVoter.username,
			password: firstVoter.password,
		}),
		HTTP_PARAMS,
	);

	if (loginRes.status !== 200) {
		fail(
			`Setup failed: Could not login as ${firstVoter.username}. Status: ${loginRes.status}, Body: ${loginRes.body}`,
		);
	}

	const loginData = JSON.parse(loginRes.body);
	const {token} = loginData.data;

	// Fetch motion details to get choices
	const motionRes = http.get(
		`${BASE_URL}${API_PREFIX}/voter/motions/${MOTION_ID}`,
		{
			headers: {
				...HTTP_PARAMS.headers,
				Authorization: `Bearer ${token}`,
			},
		},
	);

	if (motionRes.status !== 200) {
		fail(
			`Setup failed: Could not fetch motion ${MOTION_ID}. Status: ${motionRes.status}, Body: ${motionRes.body}`,
		);
	}

	const motionData = JSON.parse(motionRes.body);
	choices = motionData.data.choices;

	if (!choices || choices.length === 0) {
		fail(`Setup failed: Motion ${MOTION_ID} has no choices`);
	}

	console.log(`Found ${choices.length} choices for motion ${MOTION_ID}:`);
	choices.forEach((c, i) => { console.log(`  ${i + 1}. ${c.name} (ID: ${c.id})`); });
	console.log(`\n`);

	return { choices };
}

export default function (data) {
	const {choices} = data;

	// Each VU gets a unique voter based on VU number
	// Use modulo to handle case where VUs > voters
	const voterIndex = (__VU - 1) % voters.length;
	const voter = voters[voterIndex];

	// Step 1: Login
	const loginRes = http.post(
		`${BASE_URL}${API_PREFIX}/auth/login`,
		JSON.stringify({
			username: voter.username,
			password: voter.password,
		}),
		HTTP_PARAMS,
	);

	const loginSuccess = check(loginRes, {
		"login status is 200": (r) => r.status === 200,
	});

	if (!loginSuccess) {
		loginFailedCounter.add(1);
		console.log(
			`Login failed for ${voter.username}: ${loginRes.status} - ${loginRes.body}`,
		);
		sleep(1);
		return;
	}

	const loginData = JSON.parse(loginRes.body);
	const {token} = loginData.data;

	// Step 2: Cast vote
	// Randomly select a choice (simulates real voting behavior)
	const selectedChoice = choices[Math.floor(Math.random() * choices.length)];

	const voteStart = Date.now();
	const voteRes = http.post(
		`${BASE_URL}${API_PREFIX}/voter/motions/${MOTION_ID}/vote`,
		JSON.stringify({
			choiceIds: [selectedChoice.id],
		}),
		{
			headers: {
				...HTTP_PARAMS.headers,
				Authorization: `Bearer ${token}`,
			},
		},
	);
	const voteEnd = Date.now();

	// Record vote duration
	voteDuration.add(voteEnd - voteStart);

	// Check vote result
	if (voteRes.status === 200 || voteRes.status === 201) {
		voteSuccessCounter.add(1);
		voteSuccessRate.add(true);
		check(voteRes, {
			"vote successful": (r) => r.status === 200 || r.status === 201,
		});
	} else if (voteRes.status === 409) {
		// Already voted - this is expected for repeat iterations
		voteAlreadyVotedCounter.add(1);
		voteSuccessRate.add(true); // Still counts as "working correctly"
		check(voteRes, {
			"already voted (expected)": (r) => r.status === 409,
		});
	} else {
		voteFailedCounter.add(1);
		voteSuccessRate.add(false);
		console.log(
			`Vote failed for ${voter.username}: ${voteRes.status} - ${voteRes.body}`,
		);
	}

	// Random sleep between 0.5-2 seconds to simulate human behavior
	sleep(0.5 + Math.random() * 1.5);
}

export function handleSummary(data) {
	const totalVotes =
		(data.metrics.votes_successful?.values?.count || 0) +
		(data.metrics.votes_already_voted?.values?.count || 0);
	const failedVotes = data.metrics.votes_failed?.values?.count || 0;

	const summary = `
${"=".repeat(70)}
VOTING SIMULATION SUMMARY
${"=".repeat(70)}

Target: ${BASE_URL}
Motion ID: ${MOTION_ID}
Voters in CSV: ${voters.length}
Test Duration: ${(data.state.testRunDurationMs / 1000 / 60).toFixed(2)} minutes

VOTE METRICS:
  Successful Votes: ${data.metrics.votes_successful?.values?.count || 0}
  Already Voted (expected): ${data.metrics.votes_already_voted?.values?.count || 0}
  Failed Votes: ${failedVotes}
  Total Valid Votes: ${totalVotes}

LOGIN METRICS:
  Failed Logins: ${data.metrics.logins_failed?.values?.count || 0}

PERFORMANCE:
  Total HTTP Requests: ${data.metrics.http_reqs?.values?.count || 0}
  Request Rate: ${data.metrics.http_reqs?.values?.rate?.toFixed(2) || 0} req/s

  Vote Duration (avg): ${data.metrics.vote_duration?.values?.avg?.toFixed(2) || 0}ms
  Vote Duration (p95): ${data.metrics.vote_duration?.values?.["p(95)"]?.toFixed(2) || 0}ms
  Vote Duration (p99): ${data.metrics.vote_duration?.values?.["p(99)"]?.toFixed(2) || 0}ms

  HTTP Duration (avg): ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0}ms
  HTTP Duration (p95): ${data.metrics.http_req_duration?.values?.["p(95)"]?.toFixed(2) || 0}ms
  HTTP Duration (p99): ${data.metrics.http_req_duration?.values?.["p(99)"]?.toFixed(2) || 0}ms

ERROR RATE:
  HTTP Failures: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%
  Vote Success Rate: ${((data.metrics.vote_success_rate?.values?.rate || 0) * 100).toFixed(2)}%

${"=".repeat(70)}
`;

	console.log(summary);

	return {
		stdout: summary,
	};
}

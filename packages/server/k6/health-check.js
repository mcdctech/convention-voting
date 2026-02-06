/**
 * k6 Health Check Test
 *
 * Simple test to verify the server is responding.
 * Run this first to validate connectivity before running voting tests.
 *
 * Usage:
 *   k6 run health-check.js
 *   k6 run --out json=health-results.json health-check.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, SMOKE_STAGES, THRESHOLDS } from "./config.js";

export const options = {
	stages: SMOKE_STAGES,
	thresholds: THRESHOLDS,
};

export default function () {
	// Test the health endpoint
	const healthRes = http.get(`${BASE_URL}/health`);

	check(healthRes, {
		"health status is 200": (r) => r.status === 200,
		"health response has status ok": (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.status === "ok";
			} catch {
				return false;
			}
		},
		"health response time < 200ms": (r) => r.timings.duration < 200,
	});

	// Small pause between iterations
	sleep(1);
}

export function handleSummary(data) {
	console.log("\n" + "=".repeat(60));
	console.log("HEALTH CHECK SUMMARY");
	console.log("=".repeat(60));
	console.log(`Target: ${BASE_URL}`);
	console.log(`Total Requests: ${data.metrics.http_reqs.values.count}`);
	console.log(
		`Failed Requests: ${data.metrics.http_req_failed.values.passes || 0}`,
	);
	console.log(
		`Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`,
	);
	console.log(
		`P95 Response Time: ${data.metrics.http_req_duration.values["p(95)"].toFixed(2)}ms`,
	);
	console.log("=".repeat(60) + "\n");

	return {
		stdout: JSON.stringify(data, null, 2),
	};
}

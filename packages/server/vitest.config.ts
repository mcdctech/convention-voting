/**
 * Vitest configuration for unit tests
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		passWithNoTests: true,
		include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
		exclude: ["src/**/*.integration.test.ts", "src/**/*.integration.spec.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"dist/**",
				"src/**/*.test.ts",
				"src/**/*.spec.ts",
				"src/scripts/**",
			],
		},
	},
});

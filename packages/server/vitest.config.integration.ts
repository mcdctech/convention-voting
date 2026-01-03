/**
 * Vitest configuration for integration tests
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.spec.ts"],
    // Run integration tests sequentially to avoid database conflicts
    threads: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});

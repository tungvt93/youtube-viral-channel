import { defineConfig } from "vitest/config";

/**
 * Longer timeouts than every other package's default (plain `vitest run`,
 * no config) because this suite spawns a real `apps/api` child process and
 * waits for it to finish booting against the real dev Postgres/Redis,
 * rather than mocking anything out.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    setupFiles: ["./src/setup-env.ts"],
  },
});

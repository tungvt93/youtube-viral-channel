import path from "node:path";

/**
 * Loads the repo-root `.env` into `process.env` before any test file runs,
 * the same file `apps/api`/`apps/worker` read in dev — never logged, only
 * read. `apps/api` is spawned as a child process later (`api-process.ts`)
 * and inherits this already-populated `process.env`.
 */
const envPath = path.resolve(__dirname, "../../../.env");
process.loadEnvFile(envPath);

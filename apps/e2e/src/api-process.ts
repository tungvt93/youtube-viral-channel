import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const API_ROOT = path.resolve(__dirname, "../../api");
const READY_POLL_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 45_000;

export interface RunningApi {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Spawns a real `apps/api` (`ts-node src/main.ts`, same as `pnpm run
 * start:dev`) on a dedicated port so this suite never collides with a dev
 * instance someone else has running on the default `3001`. It talks to the
 * same real `DATABASE_URL`/`REDIS_HOST` as the rest of the dev stack
 * (inherited from `process.env`, loaded by `setup-env.ts`) — there is no
 * separate "test database" in this plan (see plan Decisions, 2026-11-06).
 */
export async function startApi(port: number): Promise<RunningApi> {
  const child: ChildProcess = spawn("node", ["-r", "ts-node/register", "src/main.ts"], {
    cwd: API_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  const exitPromise = new Promise<never>((_, reject) => {
    child.once("exit", (code) => {
      reject(new Error(`apps/api exited early (code ${code}) before becoming ready:\n${stderrTail}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await Promise.race([waitUntilReady(baseUrl), exitPromise]).catch((error) => {
    child.kill("SIGTERM");
    throw error;
  });

  return {
    baseUrl,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}

async function waitUntilReady(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/auth/me`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
    }
  }
  throw new Error(`apps/api did not become ready at ${baseUrl} within ${READY_TIMEOUT_MS}ms`);
}

import { defineConfig } from "vitest/config";

/** Next.js (React 18+) uses the automatic JSX runtime — without this, esbuild falls back to the classic transform and expects a `React` global that isn't imported anywhere in this codebase. */
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
});

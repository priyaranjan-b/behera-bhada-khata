import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The real package throws outside a React Server Components bundle.
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["test/setup.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // PGlite boots a whole Postgres per test file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

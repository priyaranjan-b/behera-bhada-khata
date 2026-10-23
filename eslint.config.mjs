import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Layering (see "Data access" in CLAUDE.md): only src/server/adapters may
  // import a database/auth SDK; the UI reaches data through the API client.
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*", "@/server/adapters/*", "@/server/infra", "@/server/infra/*"],
              message: "Route handlers stay thin: call a service in src/server/services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/server/**", "src/proxy.ts", "src/lib/api-client/server.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*"], message: "Database access lives in src/server/adapters - go through the API." },
            {
              group: ["@/server/*"],
              message: "UI code reads data with serverApi (Server Components) or api (Client Components).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*", "@/server/adapters/*"], message: "Services use the ports via @/server/infra." },
            { group: ["next", "next/*"], message: "Keep services framework-free so they can move to a standalone server." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude Code skills (third-party scripts, not app code).
    ".claude/**",
  ]),
]);

export default eslintConfig;

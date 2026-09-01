import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "e2e-real/**", "node_modules/**", ".next/**"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["components/**/*.tsx", "lib/**/*.ts"],
      // `server-only` modules throw when imported under jsdom, so they cannot be unit tested here
      // and would otherwise report 0% for a structural reason rather than a quality one. Their
      // testable logic is deliberately factored out: `lib/site-origin.ts` holds the host and URL
      // rules that `lib/seo.ts` merely wraps.
      exclude: [
        "lib/menu-api.ts",
        "lib/server-api.ts",
        "lib/seo.ts",
        "lib/public-data.ts",
        "lib/tenant-document.ts",
        "lib/admin-data.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});

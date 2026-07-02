import { defineConfig } from "vitest/config";

// node:sqlite is a newer Node builtin that Vite's resolver does not yet
// externalize automatically; mark it external so vitest requires it at runtime.
export default defineConfig({
  test: {
    server: { deps: { external: [/node:sqlite/, /^sqlite$/] } },
  },
  ssr: { external: ["node:sqlite"] },
});

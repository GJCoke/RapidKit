import { fileURLToPath } from "node:url"
import { defineConfig, mergeConfig } from "vitest/config"
import viteConfig from "./vite.config"

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      // Workspace hooks have a bundler-only package entry. Use source in the test runtime.
      alias: {
        "@rapidkit/hooks": fileURLToPath(new URL("../../packages/hooks/src/index.ts", import.meta.url)),
        "@rapidkit/utils": fileURLToPath(new URL("../../packages/utils/src/index.ts", import.meta.url)),
      },
    },
  }),
)

import process from "node:process"
import { URL, fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import { setupVitePlugins } from "./builder/plugins"
import { createViteProxy, getBuildTime } from "./builder/config"
import { browserSentryBuild } from "../../scripts/sentry-build"

export default defineConfig((configEnv) => {
  const viteEnv = loadEnv(configEnv.mode, process.cwd()) as unknown as Env.ImportMeta

  const buildTime = getBuildTime()

  const enableProxy = configEnv.command === "serve" && !configEnv.isPreview
  const monitoring = browserSentryBuild(
    { ...viteEnv, ...process.env },
    "vue",
    fileURLToPath(new URL("./", import.meta.url)),
  )

  return {
    base: viteEnv.VITE_BASE_URL,
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./", import.meta.url)),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          additionalData: `@use "@/styles/scss/global.scss" as *;`,
        },
      },
    },
    plugins: [setupVitePlugins(viteEnv, buildTime), ...(configEnv.command === "build" ? monitoring.plugins : [])],
    define: {
      BUILD_TIME: JSON.stringify(buildTime),
    },
    server: {
      host: "0.0.0.0",
      port: 9527,
      open: true,
      proxy: createViteProxy(viteEnv, enableProxy),
    },
    preview: {
      port: 9725,
    },
    build: {
      reportCompressedSize: false,
      sourcemap: monitoring.sourcemap,
      commonjsOptions: {
        ignoreTryCatch: false,
      },
    },
  }
})

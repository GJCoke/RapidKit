import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const serviceBaseUrl = env.VITE_SERVICE_BASE_URL || "http://localhost:8000"

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: 3100,
      proxy: {
        "/api": {
          target: serviceBaseUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) return "react"
            if (id.includes("/node_modules/react-router/")) return "router"
            if (id.includes("/node_modules/@tanstack/react-query/")) return "query"
          },
        },
      },
    },
  }
})

import { loadEnv, ConfigEnv, UserConfig } from "vite"
import { exec } from "child_process"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"
import crypto from "crypto"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function generateOpenapiTypesPlugin() {
  let env: Env.ImportMeta
  let lastHash = ""
  const outputPath = path.resolve(__dirname, "../../src/typings/schema.d.ts")

  const runOpenapiTypescript = () => {
    exec(`npx openapi-typescript ${env.VITE_SERVICE_OPENAPI_URL} -o ${outputPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error("[openapi] Type generation failed:", error)
      } else {
        console.log("[openapi] Types generated.")
      }
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
    })
  }

  const calculateHash = () => {
    const buffer = fs.readFileSync(outputPath)
    return crypto.createHash("sha256").update(buffer).digest("hex")
  }

  return {
    name: "vite-plugin-generate-openapi-types",

    buildStart() {
      if (process.env.NODE_ENV !== "development") return
      console.log("[openapi] Generating types on build start...")
      lastHash = calculateHash()
      runOpenapiTypescript()
    },

    config(_: UserConfig, { mode }: ConfigEnv) {
      if (process.env.NODE_ENV !== "development") return
      env = loadEnv(mode, process.cwd()) as Env.ImportMeta
    },

    handleHotUpdate() {
      if (process.env.NODE_ENV !== "development") return
      if (!env.VITE_SERVICE_OPENAPI_URL) return

      const newHash = calculateHash()
      if (newHash === lastHash) return
      lastHash = newHash

      runOpenapiTypescript()
    },
  }
}

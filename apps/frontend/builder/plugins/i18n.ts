import path from "path"
import { fileURLToPath } from "url"
import { exec } from "child_process"
import { HmrContext } from "vite"
import crypto from "crypto"
import fs from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function generateI18nTypesPlugin() {
  const localesDir = path.resolve(__dirname, "../../src/locales/langs")
  const scriptPath = path.resolve(__dirname, "../../scripts/gen-i18n-types.ts")

  let lastHash = ""

  const runGenerator = () => {
    exec(`ts-node ${scriptPath}`, (err, stdout, stderr) => {
      if (err) {
        console.error("[i18n] Type generation failed:", err)
      } else {
        console.log("[i18n] Types generated.")
      }
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
    })
  }

  const calculateHash = () => {
    const files = fs
      .readdirSync(localesDir, { recursive: true })
      .filter((f) => String(f).endsWith(".json"))
      .map((f) => path.join(localesDir, String(f)))

    return crypto
      .createHash("sha256")
      .update(files.map((f) => fs.readFileSync(f)).join(""))
      .digest("hex")
  }

  return {
    name: "vite-plugin-generate-i18n-types",

    buildStart() {
      if (process.env.NODE_ENV !== "development") return
      console.log("[i18n] Generating types on build start...")
      lastHash = calculateHash()
      runGenerator()
    },

    handleHotUpdate(ctx: HmrContext) {
      if (process.env.NODE_ENV !== "development") return

      const file = ctx.file
      if (!file.endsWith(".json")) return
      if (!path.resolve(file).startsWith(localesDir)) return

      const newHash = calculateHash()
      if (newHash === lastHash) return
      lastHash = newHash

      console.log(`[i18n] Locale file changed: ${file}`)
      runGenerator()
    },
  }
}

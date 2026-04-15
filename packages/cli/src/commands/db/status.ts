import { defineCommand } from "citty"
import { log } from "@clack/prompts"
import { resolve } from "node:path"
import { getContext } from "../../context"
import { t } from "../../infra/i18n"
import { execCommand } from "../../infra/runner"
import { parseHeads, parseCurrent } from "../../services/alembic.service"
import { syncAlembicConfig, discoverPlugins } from "../../services/plugin.service"
import { BACKEND_DIR } from "../../constants"

export const status = defineCommand({
  meta: { name: "status", description: "Show migration status" },
  run: async () => {
    const ctx = getContext()
    const cwd = resolve(ctx.cwd, BACKEND_DIR)

    syncAlembicConfig()

    log.info(t("db.status.checking"))

    let headsOutput: string
    let currentOutput: string

    try {
      headsOutput = execCommand("uv run alembic heads", { cwd })
    } catch {
      headsOutput = ""
    }

    try {
      currentOutput = execCommand("uv run alembic current", { cwd })
    } catch {
      currentOutput = ""
    }

    const heads = parseHeads(headsOutput)
    const current = parseCurrent(currentOutput)

    const plugins = discoverPlugins()

    const rows: string[] = []
    const header = "Plugin".padEnd(16) + "Current".padEnd(16) + "Head".padEnd(16) + "Status"
    rows.push(header)
    rows.push("-".repeat(header.length))

    for (const plugin of plugins) {
      if (!plugin.hasMigrations) continue

      const headRev = heads.get(plugin.name) ?? "-"
      const shortHead = headRev === "-" ? "-" : headRev.substring(0, 12)

      const isAtHead = headRev !== "-" && current.has(headRev)
      const currentRev = isAtHead ? shortHead : "-"
      const statusStr = isAtHead ? "up to date" : "pending"

      rows.push(plugin.name.padEnd(16) + currentRev.padEnd(16) + shortHead.padEnd(16) + statusStr)
    }

    console.log("\n" + rows.join("\n") + "\n")
  },
})

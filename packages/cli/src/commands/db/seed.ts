import { defineCommand } from "citty"
import { resolve } from "node:path"
import { getContext } from "../../context"
import { t } from "../../core/i18n"
import { createTaskRunner } from "../../core/runner"
import { BACKEND_DIR } from "../../constants"

export const seed = defineCommand({
  meta: { name: "seed", description: "Run database seed" },
  run: async () => {
    const ctx = getContext()
    const backendDir = resolve(ctx.cwd, BACKEND_DIR)
    const runner = createTaskRunner({ title: t("db.seed.title"), ctx })

    await runner.run({ label: t("db.seed.running"), cwd: backendDir }, "uv", ["run", "python", "src/initdb.py"])

    runner.done()
  },
})

import { defineCommand } from "citty"
import { confirm, isCancel, log } from "@clack/prompts"
import { getContext } from "../../../context"
import { t } from "../../../core/i18n"
import { createTaskRunner } from "../../../core/runner"
import { resetDatabase, ensureMigrationFiles, rebuildDatabase } from "../../../core/database"

export const reset = defineCommand({
  meta: { name: "reset", description: "Reset database (drop all tables + regenerate)" },
  run: async () => {
    const ctx = getContext()

    const shouldReset = await confirm({ message: t("db.reset.confirm") })
    if (isCancel(shouldReset) || !shouldReset) return

    const confirmAgain = await confirm({ message: t("db.reset.doubleConfirm") })
    if (isCancel(confirmAgain) || !confirmAgain) return

    const runner = createTaskRunner({ title: t("db.reset.title"), ctx })

    await resetDatabase(runner, ctx)

    const shouldRebuild = await confirm({ message: t("db.reset.rebuild") })
    if (!isCancel(shouldRebuild) && shouldRebuild) {
      ensureMigrationFiles(runner)
      rebuildDatabase(runner)
    } else {
      log.info(t("db.reset.manualHint"))
    }

    runner.done()
  },
})

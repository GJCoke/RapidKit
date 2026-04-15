import { defineCommand, runCommand } from "citty"
import { select, isCancel, log } from "@clack/prompts"
import { t, type MessageKey } from "../../../infra/i18n"
import { reset } from "./reset"

const subs = { reset }

export const db = defineCommand({
  meta: { name: "db", description: "Database management" },
  subCommands: subs,
  run: async ({ rawArgs }) => {
    // 当通过交互式菜单进入时 rawArgs 为空，手动展示子菜单
    const hasSubCommand = rawArgs?.some((arg: string) => arg in subs)
    if (hasSubCommand) return

    const options = Object.keys(subs).map((key) => {
      const i18nKey = `dev.db.${key}.description` as MessageKey
      return { value: key, label: t(i18nKey) ?? key }
    })

    const selected = await select({ message: t("common.selectWorkflow"), options })
    if (isCancel(selected)) {
      log.warn(t("common.cancelled"))
      return
    }

    await runCommand(subs[selected as keyof typeof subs], { rawArgs: [] })
  },
})

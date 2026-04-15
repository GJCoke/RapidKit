/* oxlint-disable @typescript-eslint/no-explicit-any */
import { defineCommand, runMain, runCommand } from "citty"
import { select, isCancel, log } from "@clack/prompts"
import { createContext } from "./context"
import { t, type MessageKey } from "./infra/i18n"
import { FluxError } from "./errors"
import { dev } from "./commands/dev"
import { prod } from "./commands/prod"
import { clean } from "./commands/clean"
import { config } from "./commands/config"
import { createPlugin } from "./commands/create-plugin"
import { db } from "./commands/db"

const domains = { dev, prod, clean, config, "create-plugin": createPlugin, db }

type DomainKey = keyof typeof domains

const domainLabels: Record<DomainKey, () => string> = {
  dev: () => t("dev.description"),
  prod: () => t("prod.description"),
  clean: () => t("clean.description"),
  config: () => t("config.description"),
  "create-plugin": () => t("createPlugin.description"),
  db: () => t("db.description"),
}

async function runWithSubMenu(domainName: string, domain: any): Promise<void> {
  const resolved = typeof domain === "function" ? await domain() : domain

  if (resolved.subCommands) {
    const subs = typeof resolved.subCommands === "function" ? await resolved.subCommands() : resolved.subCommands
    const subEntries = Object.entries(subs) as [string, any][]

    const resolvedSubs = await Promise.all(
      subEntries.map(async ([key, cmd]) => {
        const r = typeof cmd === "function" ? await cmd() : cmd
        const i18nKey = `${domainName}.${key}.description` as MessageKey
        return { key, label: t(i18nKey) ?? r.meta?.description ?? key }
      }),
    )

    const selected = await select({
      message: t("common.selectWorkflow"),
      options: resolvedSubs.map(({ key, label }) => ({ value: key, label })),
    })

    if (isCancel(selected)) {
      log.warn(t("common.cancelled"))
      process.exit(0)
    }

    await runCommand(subs[selected], { rawArgs: [] })
  } else {
    await runCommand(domain, { rawArgs: [] })
  }
}

const main = defineCommand({
  meta: { name: "rapidkit", version: "1.0.0", description: "Rapidkit Monorepo development workflow CLI" },
  args: {
    runtime: { type: "string", description: "Container runtime override (docker or podman)" },
    region: { type: "string", description: "Registry region override (china or global)" },
  },
  subCommands: domains,
  run: async ({ args, rawArgs }) => {
    // citty always calls parent `run` even after a subcommand — guard against that
    const hasSubCommand = rawArgs.some((arg: string) => arg in domains)
    if (hasSubCommand) return

    try {
      await createContext({ runtime: args.runtime, region: args.region })

      const selected = await select({
        message: t("common.selectWorkflow"),
        options: (Object.keys(domains) as DomainKey[]).map((key) => ({
          value: key,
          label: domainLabels[key](),
        })),
      })

      if (isCancel(selected)) {
        log.warn(t("common.cancelled"))
        process.exit(0)
      }

      await runWithSubMenu(selected, domains[selected])
    } catch (error) {
      if (error instanceof FluxError) {
        if (error.code === "CANCELLED") {
          log.warn(t("common.cancelled"))
          process.exit(0)
        }
        log.error(error.message)
        process.exit(1)
      }
      throw error
    }
  },
})

async function entry(): Promise<void> {
  await runMain(main)
}

entry()

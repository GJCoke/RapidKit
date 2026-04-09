import { defineCommand } from "citty"
import { select, isCancel, log } from "@clack/prompts"
import { loadConfig, mergeConfig } from "../core/config"
import type { RapidKitConfig } from "../core/config"
import { t } from "../core/i18n"
import { FluxError } from "../errors"

const VALID_KEYS: Record<string, string[]> = {
  runtime: ["docker", "podman"],
  region: ["china", "global"],
  locale: ["zh-CN", "en-US"],
}

async function selectKey(): Promise<string> {
  const key = await select({
    message: t("config.selectKey"),
    options: Object.keys(VALID_KEYS).map((k) => ({ value: k, label: k })),
  })
  if (isCancel(key)) throw new FluxError("", "CANCELLED")
  return key
}

async function selectValue(key: string): Promise<string> {
  const value = await select({
    message: t("config.selectValue", { key }),
    options: VALID_KEYS[key].map((v) => ({ value: v, label: v })),
  })
  if (isCancel(value)) throw new FluxError("", "CANCELLED")
  return value
}

const set = defineCommand({
  meta: { name: "set", description: "Set a config value" },
  args: {
    key: { type: "positional", description: "Config key (runtime, region, locale)", required: false },
    value: { type: "positional", description: "Config value", required: false },
  },
  run: async ({ args }) => {
    const key = args.key || (await selectKey())
    const value = args.value || (await selectValue(key))

    if (!(key in VALID_KEYS)) {
      throw new FluxError(
        t("config.invalidKey", { key, validKeys: Object.keys(VALID_KEYS).join(", ") }),
        "CONFIG_INVALID",
      )
    }

    const validValues = VALID_KEYS[key]
    if (!validValues.includes(value)) {
      throw new FluxError(t("config.invalidValue", { value, validValues: validValues.join(", ") }), "CONFIG_INVALID")
    }

    mergeConfig({ [key]: value } as Partial<RapidKitConfig>)
    log.success(t("config.updated", { key, value }))
  },
})

const get = defineCommand({
  meta: { name: "get", description: "Get a config value" },
  args: {
    key: { type: "positional", description: "Config key", required: false },
  },
  run: async ({ args }) => {
    const key = args.key || (await selectKey())
    const config = loadConfig()
    const value = config[key as keyof RapidKitConfig]
    log.info(`${key} = ${value ?? t("config.notSet")}`)
  },
})

const list = defineCommand({
  meta: { name: "list", description: "List all config" },
  run: async () => {
    const config = loadConfig()
    console.log()
    console.log(`  ${t("config.currentConfig")}:`)
    console.log()
    for (const key of Object.keys(VALID_KEYS)) {
      const value = config[key as keyof RapidKitConfig] ?? t("config.notSet")
      console.log(`  ${key.padEnd(10)} ${value}`)
    }
    console.log()
  },
})

export const config = defineCommand({
  meta: { name: "config", description: "Configuration management" },
  subCommands: { set, get, list },
})

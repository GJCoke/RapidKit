import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"

export const RapidKitConfigSchema = z.object({
  runtime: z.enum(["docker", "podman"]).optional(),
  region: z.enum(["china", "global"]).optional(),
  locale: z.enum(["zh-CN", "en-US"]).optional(),
})

export type RapidKitConfig = z.infer<typeof RapidKitConfigSchema>

const CONFIG_FILENAME = ".rapidkitrc.local.json"

export function getConfigPath(): string {
  return resolve(process.cwd(), CONFIG_FILENAME)
}

export function loadConfig(): RapidKitConfig {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return {}
  const raw = JSON.parse(readFileSync(configPath, "utf-8"))
  return RapidKitConfigSchema.parse(raw)
}

export function saveConfig(config: RapidKitConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8")
}

export function mergeConfig(partial: Partial<RapidKitConfig>): void {
  saveConfig({ ...loadConfig(), ...partial })
}

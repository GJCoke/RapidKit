import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

export interface RapidKitConfig {
  runtime?: "docker" | "podman"
  region?: "china" | "global"
  locale?: "zh-CN" | "en-US"
}

const CONFIG_FILENAME = ".rapidkit.local.json"

export function getConfigPath(): string {
  return resolve(process.cwd(), CONFIG_FILENAME)
}

export function loadConfig(): RapidKitConfig {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return {}
  return JSON.parse(readFileSync(configPath, "utf-8")) as RapidKitConfig
}

export function saveConfig(config: RapidKitConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8")
}

export function mergeConfig(partial: Partial<RapidKitConfig>): void {
  saveConfig({ ...loadConfig(), ...partial })
}

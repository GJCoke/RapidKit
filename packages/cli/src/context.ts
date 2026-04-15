import { select, isCancel } from "@clack/prompts"
import { execSync } from "node:child_process"
import { loadConfig, mergeConfig } from "./core/config"
import { setLocale } from "./core/i18n"
import { FluxError } from "./errors"

export interface FluxContext {
  runtime: "docker" | "podman"
  region: "china" | "global"
  locale: "zh-CN" | "en-US"
  cwd: string
}

let ctx: FluxContext | undefined

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function resolveRuntime(override?: string): "docker" | "podman" {
  if (override) {
    if (override !== "docker" && override !== "podman") {
      throw new FluxError(`Invalid runtime: ${override}`, "CONFIG_INVALID")
    }
    if (hasCommand(override)) return override
    throw new FluxError(`${override} is not installed or not in PATH`, "RUNTIME_NOT_FOUND")
  }

  const config = loadConfig()
  if (config.runtime) {
    if (hasCommand(config.runtime)) return config.runtime
    // Fallback to auto-detect
  }

  if (hasCommand("docker")) return "docker"
  if (hasCommand("podman")) return "podman"
  throw new FluxError("Neither docker nor podman found", "RUNTIME_NOT_FOUND")
}

function resolveRegion(override?: string): "china" | "global" {
  if (override) {
    if (override !== "china" && override !== "global") {
      throw new FluxError(`Invalid region: ${override}`, "CONFIG_INVALID")
    }
    return override
  }
  return loadConfig().region ?? "global"
}

async function resolveLocale(): Promise<"zh-CN" | "en-US"> {
  const config = loadConfig()
  if (config.locale) return config.locale

  const locale = await select({
    message: "Select language / \u9009\u62e9\u8bed\u8a00",
    options: [
      { value: "zh-CN" as const, label: "\u4e2d\u6587" },
      { value: "en-US" as const, label: "English" },
    ],
  })

  if (isCancel(locale)) {
    throw new FluxError("", "CANCELLED")
  }

  mergeConfig({ locale })
  return locale
}

export async function createContext(args: { runtime?: string; region?: string }): Promise<FluxContext> {
  const runtime = resolveRuntime(args.runtime)
  const region = resolveRegion(args.region)
  const locale = await resolveLocale()

  setLocale(locale)
  ctx = { runtime, region, locale, cwd: process.cwd() }
  return ctx
}

/**
 * Get the current context. If not initialized (e.g., subcommand invoked directly),
 * creates one synchronously from config + auto-detect (without locale prompt).
 */
export function getContext(): FluxContext {
  if (!ctx) {
    // Lazy init for direct subcommand invocation (e.g., `rapidkit dev up`)
    const config = loadConfig()
    const runtime = resolveRuntime(undefined)
    const region = resolveRegion(undefined)
    const locale = config.locale ?? "zh-CN"
    setLocale(locale)
    ctx = { runtime, region, locale, cwd: process.cwd() }
  }
  return ctx
}

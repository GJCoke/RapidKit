import { execSync, spawn as nodeSpawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import type { FluxContext } from "../context"
import { hasCommand } from "./runner"

export interface ComposeCommand {
  cmd: string
  args: string[]
}

function getComposeCommand(ctx: FluxContext): string[] {
  if (ctx.runtime === "podman") {
    return hasCommand("podman-compose") ? ["podman-compose"] : ["podman", "compose"]
  }
  return ["docker", "compose"]
}

function getEnvFileArgs(ctx: FluxContext): string[] {
  if (ctx.region === "china") {
    const envFile = resolve(ctx.cwd, "docker/.env.build.china")
    return ["--env-file", envFile]
  }
  return []
}

export function buildComposeCommand(ctx: FluxContext, composePath: string, args: string[]): ComposeCommand {
  const composeCmd = getComposeCommand(ctx)
  const file = resolve(ctx.cwd, composePath)
  const fullArgs = [...composeCmd.slice(1), "-f", file, ...getEnvFileArgs(ctx), ...args]
  return { cmd: composeCmd[0], args: fullArgs }
}

export function buildComposeRunCommand(
  ctx: FluxContext,
  composePath: string,
  service: string,
  command: string[],
): ComposeCommand {
  return buildComposeCommand(ctx, composePath, ["run", "--rm", service, ...command])
}

export function getComposeServices(ctx: FluxContext, composePath: string): string[] {
  const { cmd, args } = buildComposeCommand(ctx, composePath, ["config", "--services"])
  const output = execSync([cmd, ...args].join(" "), {
    encoding: "utf-8",
    cwd: ctx.cwd,
  }).trim()
  return output ? output.split("\n") : []
}

const activeLogChildren = new Set<ChildProcess>()

process.on("SIGINT", () => {
  for (const child of activeLogChildren) {
    child.kill("SIGINT")
  }
  activeLogChildren.clear()
})

export function spawnComposeLogs(ctx: FluxContext, composePath: string, services: string[]): Promise<void> {
  return new Promise((resolvePromise) => {
    const children = services.map((service) => {
      const { cmd, args } = buildComposeCommand(ctx, composePath, ["logs", "-f", service])
      const child = nodeSpawn(cmd, args, { stdio: "inherit", cwd: ctx.cwd })
      activeLogChildren.add(child)
      return child
    })

    let exited = 0
    for (const child of children) {
      const onExit = () => {
        activeLogChildren.delete(child)
        exited++
        if (exited === children.length) resolvePromise()
      }
      child.on("close", onExit)
      child.on("error", onExit)
    }
  })
}

import { defineCommand, type ArgsDef, type ParsedArgs } from "citty"
import { getContext, type FluxContext } from "../context"
import { createTaskRunner, type TaskRunner } from "../infra/runner"
import { buildComposeCommand, getComposeServices, spawnComposeLogs } from "../infra/compose"
import { t, type MessageKey } from "../infra/i18n"

interface FluxCommandOptions<T extends ArgsDef = ArgsDef> {
  meta: { description: string }
  args?: T
  run: (params: { ctx: FluxContext; runner: TaskRunner; args: ParsedArgs<T> }) => Promise<void>
}

export function defineFluxCommand<T extends ArgsDef = ArgsDef>(options: FluxCommandOptions<T>) {
  return defineCommand({
    meta: options.meta,
    args: options.args,
    async run({ args }) {
      const ctx = getContext()
      const runner = createTaskRunner({ title: options.meta.description, ctx })
      try {
        await options.run({ ctx, runner, args })
      } finally {
        runner.done()
      }
    },
  })
}

export function createComposeCommand(options: {
  composePath: string
  action: string
  labelKey: MessageKey
  extraArgs?: string[]
}) {
  return defineFluxCommand({
    meta: { description: t(options.labelKey) },
    async run({ ctx, runner }) {
      const cmd = buildComposeCommand(ctx, options.composePath, [options.action, ...(options.extraArgs ?? [])])
      await runner.run({ label: t(options.labelKey) }, cmd.cmd, cmd.args)
    },
  })
}

export function createComposeLogsCommand(options: { composePath: string; labelKey: MessageKey }) {
  return defineCommand({
    meta: { description: t(options.labelKey) },
    async run() {
      const ctx = getContext()
      const services = getComposeServices(ctx, options.composePath)
      console.log(t(options.labelKey))
      await spawnComposeLogs(ctx, options.composePath, services)
    },
  })
}

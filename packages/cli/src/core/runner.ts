import { spawn, execSync, type ChildProcess } from "node:child_process"
import { FluxError } from "../errors"
import type { FluxContext } from "../context"
import * as R from "./renderer"

const activeChildren = new Set<ChildProcess>()

process.on("SIGINT", () => {
  R.showCursor()
  for (const child of activeChildren) {
    child.kill("SIGINT")
  }
  activeChildren.clear()
  process.exit(130)
})

export interface TaskRunnerOptions {
  title: string
  ctx: FluxContext
}

export interface StepOptions {
  label: string
  maxLines?: number
  keepOutput?: boolean
  env?: Record<string, string>
}

export interface TaskRunner {
  run(options: StepOptions, cmd: string, args: string[]): Promise<void>
  exec(options: StepOptions, fn: () => void): void
  done(): void
}

export function createTaskRunner(options: TaskRunnerOptions): TaskRunner {
  const startTime = Date.now()
  let stepCount = 0

  R.renderIntro(options.title)

  return { run, exec, done }

  async function run(step: StepOptions, cmd: string, args: string[]): Promise<void> {
    stepCount++
    const maxLines = step.maxLines ?? 5
    const stepStart = Date.now()

    R.hideCursor()

    let spinnerIdx = 0
    const ringBuffer: string[] = []
    let renderedLines = 0

    const redraw = () => {
      R.clearLines(renderedLines + 1)
      R.renderSpinnerStep(R.getSpinnerFrame(spinnerIdx), step.label)
      renderedLines = R.renderOutputRegion(ringBuffer)
    }

    R.renderSpinnerStep(R.getSpinnerFrame(spinnerIdx), step.label)
    const spinnerTimer = setInterval(() => {
      spinnerIdx++
      redraw()
    }, 80)

    return new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: options.ctx.cwd,
        env: step.env ? { ...process.env, ...step.env } : undefined,
      })

      activeChildren.add(child)

      const pushLine = (line: string) => {
        const trimmed = line.replace(/\r$/, "")
        if (!trimmed) return

        ringBuffer.push(trimmed)
        if (ringBuffer.length > maxLines) {
          ringBuffer.shift()
        }

        redraw()
      }

      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          pushLine(line)
        }
      }

      child.stdout?.on("data", onData)
      child.stderr?.on("data", onData)

      child.on("close", (code) => {
        clearInterval(spinnerTimer)
        activeChildren.delete(child)
        const duration = R.formatDuration(Date.now() - stepStart)

        R.clearLines(renderedLines + 1)
        if (code === 0 || code === null) {
          R.renderStepDone(step.label, duration)
          R.showCursor()
          resolve()
        } else {
          const errorLines = ringBuffer.slice(-maxLines)
          R.renderStepFail(step.label, duration, errorLines)
          R.showCursor()
          reject(new FluxError(`Command failed: ${cmd} ${args.join(" ")}`, "COMMAND_FAILED"))
        }
      })

      child.on("error", (err) => {
        clearInterval(spinnerTimer)
        activeChildren.delete(child)
        const duration = R.formatDuration(Date.now() - stepStart)
        R.clearLines(renderedLines + 1)
        R.renderStepFail(step.label, duration, [err.message])
        R.showCursor()
        reject(new FluxError(`Command failed: ${cmd}`, "COMMAND_FAILED"))
      })
    })
  }

  function exec(step: StepOptions, fn: () => void): void {
    stepCount++
    const stepStart = Date.now()
    R.renderStepStart(step.label)

    try {
      fn()
      const duration = R.formatDuration(Date.now() - stepStart)
      R.clearLines(1)
      R.renderStepDone(step.label, duration)
    } catch (error) {
      const duration = R.formatDuration(Date.now() - stepStart)
      const message = error instanceof Error ? error.message : String(error)
      R.clearLines(1)
      R.renderStepFail(step.label, duration, [message])
      throw new FluxError(`Step failed: ${step.label}`, "COMMAND_FAILED")
    }
  }

  function done(): void {
    if (stepCount > 1) {
      const totalDuration = R.formatDuration(Date.now() - startTime)
      R.renderDone(options.title, totalDuration)
    }
  }
}

export function execCommand(cmd: string, opts?: { cwd?: string }): string {
  return execSync(cmd, {
    encoding: "utf-8",
    cwd: opts?.cwd ?? process.cwd(),
  }).trim()
}

export function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

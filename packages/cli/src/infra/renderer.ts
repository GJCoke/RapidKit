const isUnicodeSupported = process.platform !== "win32" || Boolean(process.env.WT_SESSION)

const S_STEP_ACTIVE = "\u25CF" // ●
const SPINNER_FRAMES = isUnicodeSupported
  ? ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"] // ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
  : ["-", "\\", "|", "/"]
const S_STEP_ERROR = isUnicodeSupported ? "\u2716" : "\u00D7" // ✖ or ×
const S_INTRO = isUnicodeSupported ? "\u25C6" : "\u2666" // ◆ or ♦
const S_GUTTER = isUnicodeSupported ? "\u23BF" : "|" // ⎿ or |

const ANSI = {
  reset: "\x1B[0m",
  dim: "\x1B[2m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  blue: "\x1B[34m",
  cyan: "\x1B[36m",
  bold: "\x1B[1m",
  cursorUp: (n: number) => `\x1B[${n}A`,
  eraseDown: "\x1B[0J",
  eraseLine: "\x1B[2K",
  hideCursor: "\x1B[?25l",
  showCursor: "\x1B[?25h",
} as const

function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`
}

function green(text: string): string {
  return `${ANSI.green}${text}${ANSI.reset}`
}

function red(text: string): string {
  return `${ANSI.red}${text}${ANSI.reset}`
}

function blue(text: string): string {
  return `${ANSI.blue}${text}${ANSI.reset}`
}

function cyan(text: string): string {
  return `${ANSI.cyan}${text}${ANSI.reset}`
}

function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`
}

function truncateLine(text: string, padding: number): string {
  const cols = process.stdout.columns || 80
  const maxWidth = cols - padding
  if (maxWidth <= 0) return ""
  return text.length > maxWidth ? text.slice(0, maxWidth - 1) + "\u2026" : text
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs.toFixed(0)}s`
}

export function renderIntro(title: string): void {
  process.stderr.write(`\n${cyan(S_INTRO)}  ${bold(title)}\n\n`)
}

export function renderDone(title: string, duration: string): void {
  process.stderr.write(`\n${cyan(S_INTRO)}  ${bold(title)} ${dim(`(${duration})`)}\n\n`)
}

export function renderStepStart(label: string): void {
  process.stderr.write(`${blue(S_STEP_ACTIVE)} ${label}\n`)
}

export function getSpinnerFrame(index: number): string {
  return SPINNER_FRAMES[index % SPINNER_FRAMES.length]
}

export function renderSpinnerStep(frame: string, label: string): void {
  process.stderr.write(`${blue(frame)} ${label}\n`)
}

export function renderStepDone(label: string, duration: string): void {
  process.stderr.write(`${green(S_STEP_ACTIVE)} ${label}  ${dim(duration)}\n`)
}

export function renderStepFail(label: string, duration: string, errorLines: string[]): void {
  process.stderr.write(`${red(S_STEP_ERROR)} ${label}  ${dim(duration)}\n`)
  if (errorLines.length > 0) {
    process.stderr.write(`  ${dim(S_GUTTER)} ${red(errorLines[0])}\n`)
    for (let i = 1; i < errorLines.length; i++) {
      process.stderr.write(`    ${red(errorLines[i])}\n`)
    }
  }
}

/**
 * Render the live output region below the step header.
 * Returns the number of lines rendered (for clearing later).
 */
export function renderOutputRegion(lines: string[]): number {
  if (lines.length === 0) return 0

  const output = lines.map((line, i) => {
    const prefix = i === 0 ? `  ${dim(S_GUTTER)} ` : "    "
    return `${prefix}${dim(truncateLine(line, prefix.length))}`
  })

  process.stderr.write(output.join("\n") + "\n")
  return output.length
}

/**
 * Clear N lines above the cursor (used to erase the output region before redraw).
 */
export function clearLines(count: number): void {
  if (count <= 0) return
  process.stderr.write(ANSI.cursorUp(count) + ANSI.eraseDown)
}

/**
 * Clear the step header line + output region, then re-render the completed step.
 */
export function replaceStepWithDone(renderedLines: number, label: string, duration: string): void {
  // +1 for the step header line
  clearLines(renderedLines + 1)
  renderStepDone(label, duration)
}

export function replaceStepWithFail(
  renderedLines: number,
  label: string,
  duration: string,
  errorLines: string[],
): void {
  clearLines(renderedLines + 1)
  renderStepFail(label, duration, errorLines)
}

export function hideCursor(): void {
  process.stderr.write(ANSI.hideCursor)
}

export function showCursor(): void {
  process.stderr.write(ANSI.showCursor)
}

export interface CrontabValue {
  minute: string
  hour: string
  dayOfMonth: string
  monthOfYear: string
  dayOfWeek: string
}
export type CronField = keyof CrontabValue
export const cronFields: CronField[] = ["minute", "hour", "dayOfMonth", "monthOfYear", "dayOfWeek"]
export const cronModes = ["minutes", "hourly", "daily", "weekly", "monthly", "advanced"] as const
export type CronMode = (typeof cronModes)[number]
export const minuteIntervals = [1, 5, 10, 15, 20, 30]
export interface CronDraft {
  mode: CronMode
  interval: number
  minute: number
  time: string | null
  weekdays: number[]
  monthDays: number[]
  expression: string
}
export type CronError = "fields" | "time" | "weekdays" | "days"
export interface CrontabPreview {
  valid: boolean
  errorField?: CronField | null
  timezone: string
  evaluatedAt: string
  nextRuns: string[]
  horizonYears: number
}
export type PreviewLoader = (value: CrontabValue) => Promise<CrontabPreview | null>

export function formatCron(value: CrontabValue): string {
  return cronFields.map((field) => value[field]).join(" ")
}

function integer(value: string, max: number): number | null {
  const number = Number(value)
  return /^\d+$/.test(value) && number >= 0 && number <= max && String(number) === value ? number : null
}

// Recognize only the canonical preset syntax; other valid Celery expressions stay lossless in advanced mode.
function selection(value: string, min: number, max: number): number[] | null {
  const numbers = value === "1-5" && min === 0 ? [1, 2, 3, 4, 5] : value.split(",").map((v) => integer(v, max))
  if (numbers.some((n) => n === null || n < min)) return null
  const selected = [...new Set(numbers as number[])].sort((a, b) => a - b)
  return selected.length && formatSelection(selected, min === 0) === value ? selected : null
}

function formatSelection(value: number[], weekday: boolean): string {
  const selected = [...new Set(value)].sort((a, b) => a - b)
  if (weekday && selected.join(",") === "1,2,3,4,5") return "1-5"
  return selected.join(",")
}

export function decodeCron(value: CrontabValue): CronDraft {
  const minute = integer(value.minute, 59)
  const hour = integer(value.hour, 23)
  const draft: CronDraft = {
    mode: "advanced",
    interval: 15,
    minute: minute ?? 0,
    time:
      hour !== null && minute !== null
        ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
        : "09:30",
    weekdays: [1, 2, 3, 4, 5],
    monthDays: [1, 15],
    expression: formatCron(value),
  }
  if (value.monthOfYear !== "*") return draft
  if (value.dayOfMonth === "*" && value.dayOfWeek === "*") {
    if (value.hour === "*") {
      const interval = value.minute === "*" ? 1 : /^\*\/\d+$/.test(value.minute) ? Number(value.minute.slice(2)) : null
      if (
        interval !== null &&
        minuteIntervals.includes(interval) &&
        (interval === 1 ? value.minute === "*" : value.minute === `*/${interval}`)
      ) {
        draft.mode = "minutes"
        draft.interval = interval
      } else if (minute !== null) draft.mode = "hourly"
    } else if (hour !== null && minute !== null) draft.mode = "daily"
  } else if (hour !== null && minute !== null) {
    if (value.dayOfMonth === "*") {
      const days = selection(value.dayOfWeek, 0, 6)
      if (days) {
        draft.mode = "weekly"
        draft.weekdays = days
      }
    } else if (value.dayOfWeek === "*") {
      const days = selection(value.dayOfMonth, 1, 31)
      if (days) {
        draft.mode = "monthly"
        draft.monthDays = days
      }
    }
  }
  return draft
}

export function encodeCron(draft: CronDraft): { value: CrontabValue | null; error: CronError | null } {
  const value: CrontabValue = { minute: "*", hour: "*", dayOfMonth: "*", monthOfYear: "*", dayOfWeek: "*" }
  const fail = (error: CronError) => ({ value: null, error })
  if (draft.mode === "advanced") {
    const fields = draft.expression.trim().split(/\s+/)
    if (fields.length !== 5 || fields.some((field) => !field || field.length > 128)) return fail("fields")
    cronFields.forEach((field, index) => {
      value[field] = fields[index]!
    })
  } else if (draft.mode === "minutes") {
    if (!minuteIntervals.includes(draft.interval)) return fail("fields")
    value.minute = draft.interval === 1 ? "*" : `*/${draft.interval}`
  } else if (draft.mode === "hourly") {
    if (!Number.isInteger(draft.minute) || draft.minute < 0 || draft.minute > 59) return fail("fields")
    value.minute = String(draft.minute)
  } else {
    if (!draft.time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return fail("time")
    const [hour, minute] = draft.time.split(":").map(Number)
    value.hour = String(hour)
    value.minute = String(minute)
    if (draft.mode === "weekly") {
      if (!draft.weekdays.length || draft.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
        return fail("weekdays")
      value.dayOfWeek = formatSelection(draft.weekdays, true)
    } else if (draft.mode === "monthly") {
      if (!draft.monthDays.length || draft.monthDays.some((day) => !Number.isInteger(day) || day < 1 || day > 31))
        return fail("days")
      value.dayOfMonth = formatSelection(draft.monthDays, false)
    }
  }
  return { value, error: null }
}

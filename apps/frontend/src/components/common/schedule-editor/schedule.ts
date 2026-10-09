import type { CrontabValue } from "../crontab-editor/cron"

export const scheduleTypes = ["interval", "crontab", "solar"] as const
export type ScheduleType = (typeof scheduleTypes)[number]
export const intervalPeriods = ["seconds", "minutes", "hours", "days", "weeks", "milliseconds", "microseconds"] as const
export type IntervalPeriod = (typeof intervalPeriods)[number]
export const solarEvents = [
  "dawn_astronomical",
  "dawn_nautical",
  "dawn_civil",
  "sunrise",
  "solar_noon",
  "sunset",
  "dusk_civil",
  "dusk_nautical",
  "dusk_astronomical",
] as const
export type SolarEvent = (typeof solarEvents)[number]
export interface IntervalValue {
  every: number | null
  period: IntervalPeriod
}
export interface SolarValue {
  event: SolarEvent
  latitude: number | null
  longitude: number | null
}
export type ScheduleValue =
  | ({ type: "interval" } & IntervalValue)
  | ({ type: "crontab" } & CrontabValue)
  | ({ type: "solar" } & SolarValue)
export type CompleteScheduleValue =
  | { type: "interval"; every: number; period: IntervalPeriod }
  | ({ type: "crontab" } & CrontabValue)
  | { type: "solar"; event: SolarEvent; latitude: number; longitude: number }
export interface SchedulePreview {
  valid: boolean
  errorField?: string | null
  timezone: string
  evaluatedAt: string
  nextRuns: string[]
  horizonYears: number
}
export type PreviewLoader<T> = (value: T) => Promise<SchedulePreview | null>
export function defaultSchedule(type: ScheduleType): ScheduleValue {
  if (type === "interval") return { type, every: 60, period: "seconds" }
  if (type === "solar") return { type, event: "sunrise", latitude: 0, longitude: 0 }
  return { type, minute: "*", hour: "*", dayOfMonth: "*", monthOfYear: "*", dayOfWeek: "*" }
}
export function validInterval(value: IntervalValue): boolean {
  const maxByPeriod =
    value.period === "weeks" ? Math.floor(999999999 / 7) : value.period === "days" ? 999999999 : 2147483647
  return (
    typeof value.every === "number" &&
    Number.isInteger(value.every) &&
    value.every >= 1 &&
    value.every <= maxByPeriod &&
    intervalPeriods.includes(value.period)
  )
}
export function validSolar(value: SolarValue): boolean {
  return (
    solarEvents.includes(value.event) &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  )
}
export function isCompleteSchedule(value: ScheduleValue): value is CompleteScheduleValue {
  if (value.type === "interval") return validInterval(value)
  if (value.type === "solar") return validSolar(value)
  return true // Cron syntax is validated by the child and the authoritative server.
}

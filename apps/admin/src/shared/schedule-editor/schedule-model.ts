import type { ScheduleValue } from "@/services/api/schedule"
import { decodeCron, encodeCron, type CronDraft, type CronError, type CrontabValue } from "./cron-model"
export const scheduleTypes = ["interval", "crontab", "solar"] as const satisfies readonly ScheduleValue["type"][]
export type ScheduleType = (typeof scheduleTypes)[number]
export type IntervalPeriod = Extract<ScheduleValue, { type: "interval" }>["period"]
export type SolarEvent = Extract<ScheduleValue, { type: "solar" }>["event"]
export const intervalPeriods = [
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "milliseconds",
  "microseconds",
] as const satisfies readonly IntervalPeriod[]
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
] as const satisfies readonly SolarEvent[]
export interface IntervalDraft {
  every: number | null
  period: IntervalPeriod
}
export interface SolarDraft {
  event: SolarEvent
  latitude: number | null
  longitude: number | null
}
export interface ScheduleDraft {
  kind: ScheduleType
  interval: IntervalDraft
  crontab: CronDraft
  solar: SolarDraft
}
const defaultCron = (): CrontabValue => ({ minute: "*", hour: "*", dayOfMonth: "*", monthOfYear: "*", dayOfWeek: "*" })
export function createScheduleDraft(value?: ScheduleValue): ScheduleDraft {
  return {
    kind: value?.type ?? "interval",
    interval:
      value?.type === "interval" ? { every: value.every, period: value.period } : { every: 60, period: "seconds" },
    crontab: decodeCron(value?.type === "crontab" ? value : defaultCron()),
    solar:
      value?.type === "solar"
        ? { event: value.event, latitude: value.latitude, longitude: value.longitude }
        : { event: "sunrise", latitude: 0, longitude: 0 },
  }
}
export function selectSchedule(draft: ScheduleDraft, kind: ScheduleType): ScheduleDraft {
  return { ...draft, kind }
}
export function validInterval(value: IntervalDraft) {
  const max = value.period === "weeks" ? Math.floor(999999999 / 7) : value.period === "days" ? 999999999 : 2147483647
  return (
    typeof value.every === "number" &&
    Number.isInteger(value.every) &&
    value.every >= 1 &&
    value.every <= max &&
    intervalPeriods.includes(value.period)
  )
}
export function validSolar(value: SolarDraft) {
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
export function encodeSchedule(
  draft: ScheduleDraft,
): { value: ScheduleValue; error: null } | { value: null; error: CronError | "interval" | "solar" } {
  if (draft.kind === "interval") {
    const { every, period } = draft.interval
    return validInterval(draft.interval) && every !== null
      ? { value: { type: "interval", every, period }, error: null }
      : { value: null, error: "interval" }
  }
  if (draft.kind === "solar") {
    const { event, latitude, longitude } = draft.solar
    return validSolar(draft.solar) && latitude !== null && longitude !== null
      ? { value: { type: "solar", event, latitude, longitude }, error: null }
      : { value: null, error: "solar" }
  }
  const result = encodeCron(draft.crontab)
  return result.value
    ? { value: { type: "crontab", ...result.value }, error: null }
    : { value: null, error: result.error ?? "fields" }
}
/** API previews are printed in the supplied scheduling timezone, not the browser's timezone. */
export function displayScheduleTime(value: string, precise = false) {
  const local = value.replace("T", " ").replace(/(?:[+-]\d{2}:\d{2}|Z)$/, "")
  return precise ? local : local.replace(/\.\d+$/, "")
}

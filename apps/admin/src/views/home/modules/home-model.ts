import { z } from "zod"
import type { ActivityCategory, ActivityItem, InstanceResource } from "@/services/api/dashboard"

export const homeCapabilities = [
  "dashboard.overview",
  "dashboard.application-health",
  "dashboard.activity",
  "dashboard.business",
  "dashboard.infrastructure",
  "dashboard.api-monitoring",
] as const
export type HomeCapability = (typeof homeCapabilities)[number]
export type ActivityFilter = "all" | ActivityCategory
export function selectHomeModules(allowed: readonly string[]) {
  return homeCapabilities.filter(
    (key) =>
      allowed.includes(key) && !(key === "dashboard.business" && allowed.includes("dashboard.application-health")),
  )
}
const emptyResources: InstanceResource = {
  hostname: "summary",
  cpuPercent: 0,
  memoryUsed: 0,
  memoryTotal: 0,
  memoryPercent: 0,
  diskUsed: 0,
  diskTotal: 0,
  diskPercent: 0,
  netSent: 0,
  netRecv: 0,
}
export function aggregateResources(instances: readonly InstanceResource[]): InstanceResource {
  if (!instances.length) return { ...emptyResources }
  if (instances.length === 1) return instances[0]
  const sum = (key: Exclude<keyof InstanceResource, "hostname">) =>
    instances.reduce((total, item) => total + item[key], 0)
  const memoryTotal = sum("memoryTotal"),
    diskTotal = sum("diskTotal")
  return {
    hostname: "summary",
    cpuPercent: Math.round((sum("cpuPercent") / instances.length) * 10) / 10,
    memoryUsed: sum("memoryUsed"),
    memoryTotal,
    memoryPercent: memoryTotal ? Math.round((sum("memoryUsed") / memoryTotal) * 1000) / 10 : 0,
    diskUsed: sum("diskUsed"),
    diskTotal,
    diskPercent: diskTotal ? Math.round((sum("diskUsed") / diskTotal) * 1000) / 10 : 0,
    netSent: sum("netSent"),
    netRecv: sum("netRecv"),
  }
}
export function selectedResource(instances: readonly InstanceResource[], selected: string) {
  const instance = instances.find((item) => item.hostname === selected)
  return instance ? { selected, data: instance } : { selected: "summary", data: aggregateResources(instances) }
}
export function prependActivity(items: ActivityItem[], item: ActivityItem, category: ActivityFilter) {
  if ((category !== "all" && category !== item.category) || items.some((row) => row.id === item.id)) return items
  return [item, ...items.slice(0, 19)]
}
export function activityText(
  key: string | null | undefined,
  params: Record<string, unknown> | undefined,
  translate: (key: string, params?: Record<string, unknown>) => string,
  exists: (key: string) => boolean,
) {
  const mapped = key?.startsWith("page.home.dashboard.activity.")
    ? `home.activity.${key.slice("page.home.dashboard.activity.".length)}`
    : "home.activity.unknown"
  const values = { ...params }
  if (typeof values.duration === "number" && Number.isFinite(values.duration))
    values.duration = Number(values.duration.toFixed(2))
  return translate(exists(mapped) ? mapped : "home.activity.unknown", values)
}
export function formatTraffic(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB/s`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`
  return `${(bytes / 1024).toFixed(1)} KB/s`
}
export function formatUptime(seconds: number) {
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  }
}
export function changeTone(value: number | null | undefined, inverted = false) {
  if (value === null || value === undefined || value === 0) return "muted"
  return (inverted ? value < 0 : value > 0) ? "success" : "destructive"
}
const number = z.number().finite()
export const resourceEvent = z.object({
  hostname: z.string().min(1),
  cpuPercent: number,
  memoryUsed: number,
  memoryTotal: number,
  memoryPercent: number,
  diskUsed: number,
  diskTotal: number,
  diskPercent: number,
  netSent: number,
  netRecv: number,
})
export const activityEvent = z.object({
  id: z.string().min(1),
  createTime: z.string().default(""),
  updateTime: z.string().default(""),
  category: z.enum(["task", "user", "system", "alert"]),
  level: z.enum(["info", "success", "warning", "error"]),
  eventCode: z.string(),
  actorId: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
  subjectType: z.string(),
  subjectId: z.string().nullable().optional(),
  subjectName: z.string().nullable().optional(),
  titleKey: z.string(),
  titleParams: z.record(z.unknown()).default({}),
  descriptionKey: z.string().nullable().optional(),
  descriptionParams: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  occurredAt: z.string(),
})
export const apiStatsEvent = z.object({
  topFailures: z
    .array(
      z.object({
        path: z.string(),
        method: z.string(),
        requestCount: number.default(0),
        errorCount: number,
        errorRate: number,
        avgMs: number.default(0),
        p95Ms: number.default(0),
      }),
    )
    .optional(),
})

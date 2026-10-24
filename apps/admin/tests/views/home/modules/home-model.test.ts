import { expect, test } from "vitest"
import {
  aggregateResources,
  selectHomeModules,
  selectedResource,
  prependActivity,
  activityText,
  resourceEvent,
  activityEvent,
  apiStatsEvent,
  formatTraffic,
  formatUptime,
  changeTone,
} from "@/views/home/modules/home-model"
const resource = (hostname: string, cpuPercent: number, memoryUsed: number, memoryTotal: number) => ({
  hostname,
  cpuPercent,
  memoryUsed,
  memoryTotal,
  memoryPercent: (memoryUsed / memoryTotal) * 100,
  diskUsed: 20,
  diskTotal: 100,
  diskPercent: 20,
  netSent: 1024,
  netRecv: 1048576,
})
const event = {
  id: "new",
  category: "task",
  level: "success",
  eventCode: "task.done",
  subjectType: "task",
  titleKey: "page.home.dashboard.activity.taskSucceeded",
  titleParams: { duration: 1.236 },
  occurredAt: "2026-10-24T00:00:00Z",
}
test("all six source capabilities preserve order and business merges only with granted application health", () => {
  const six = [
    "dashboard.overview",
    "dashboard.application-health",
    "dashboard.activity",
    "dashboard.business",
    "dashboard.infrastructure",
    "dashboard.api-monitoring",
  ]
  expect(selectHomeModules([...six].reverse())).toEqual(six.filter((key) => key !== "dashboard.business"))
  expect(selectHomeModules(["unknown", "dashboard.business", "dashboard.infrastructure"])).toEqual([
    "dashboard.business",
    "dashboard.infrastructure",
  ])
  expect(selectHomeModules(["dashboard.trends", "unknown"])).toEqual([])
})
test("resources average CPU and weight memory/disk by totals, sum network, and preserve single-instance values", () => {
  const a = resource("a", 10, 10, 100),
    b = resource("b", 90, 900, 1000)
  expect(aggregateResources([a, b])).toMatchObject({
    cpuPercent: 50,
    memoryUsed: 910,
    memoryTotal: 1100,
    memoryPercent: 82.7,
    diskUsed: 40,
    diskTotal: 200,
    diskPercent: 20,
    netSent: 2048,
    netRecv: 2097152,
  })
  expect(aggregateResources([a])).toEqual(a)
  expect(aggregateResources([])).toMatchObject({ cpuPercent: 0, memoryPercent: 0, diskPercent: 0 })
  expect(selectedResource([a, b], "b")).toEqual({ selected: "b", data: b })
  expect(selectedResource([a], "removed")).toEqual({ selected: "summary", data: a })
})
test("validated activity streams filter category, deduplicate, cap at twenty, and reject malformed payloads", () => {
  const item = activityEvent.parse(event),
    rows = Array.from({ length: 20 }, (_, i) => ({ ...item, id: String(i) }))
  expect(prependActivity(rows, item, "user")).toBe(rows)
  expect(prependActivity(rows, rows[0], "all")).toBe(rows)
  expect(prependActivity(rows, item, "task").map((x) => x.id)).toEqual(["new", ...rows.slice(0, 19).map((x) => x.id)])
  expect(activityEvent.safeParse({ ...event, category: "invalid" }).success).toBe(false)
  expect(resourceEvent.safeParse({ ...resource("a", 1, 1, 2), cpuPercent: Infinity }).success).toBe(false)
  expect(apiStatsEvent.parse({ topFailures: [] }).topFailures).toEqual([])
})
test("activity translations map only known keys, round finite duration and retain descriptions and unknown fallback", () => {
  const translate = (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`
  expect(activityText(event.titleKey, event.titleParams, translate, () => true)).toBe(
    'home.activity.taskSucceeded:{"duration":1.24}',
  )
  expect(activityText("unsafe.key", {}, translate, () => true)).toBe("home.activity.unknown:{}")
  expect(activityText("page.home.dashboard.activity.missing", {}, translate, () => false)).toBe(
    "home.activity.unknown:{}",
  )
})
test("traffic, uptime and delta colors retain zero and inverse error/queue semantics", () => {
  expect(formatTraffic(1024)).toBe("1.0 KB/s")
  expect(formatTraffic(1048576)).toBe("1.0 MB/s")
  expect(formatTraffic(1073741824)).toBe("1.0 GB/s")
  expect(formatUptime(90061)).toEqual({ days: 1, hours: 1, minutes: 1 })
  expect(changeTone(1, false)).toBe("success")
  expect(changeTone(1, true)).toBe("destructive")
  expect(changeTone(-1, true)).toBe("success")
  expect(changeTone(0, false)).toBe("muted")
  expect(changeTone(null, true)).toBe("muted")
})

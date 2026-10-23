import { expect, test } from "vitest"
import {
  queueState,
  sortQueues,
  utilization,
  workerHealth,
  workerCapacity,
  validResize,
  normalizeWorker,
  queueRecordLocation,
  workerStatusEvent,
} from "@/views/queue/dashboard/modules/queue-model"
test("unknown broker samples never become zero and blocked queues sort before larger healthy queues", () => {
  const unknown = { name: "unknown", depth: null, consumers: null },
    blocked = { name: "blocked", depth: 2, consumers: 0 },
    healthy = { name: "healthy", depth: 10, consumers: 2 },
    idle = { name: "idle", depth: 0, consumers: 0 }
  expect([unknown, blocked, healthy, idle].map(queueState)).toEqual(["unknown", "blocked", "healthy", "idle"])
  expect(sortQueues([unknown, healthy, idle, blocked])).toEqual([blocked, healthy, idle, unknown])
  expect(healthy.depth).toBe(10)
  expect(utilization(3, 8)).toBe(37.5)
  expect(utilization(2, 0)).toBeNull()
  expect(utilization(5, 4)).toBe(125)
})
test("worker health uses UTC heartbeats, distinguishes stale and missing snapshots, and does not invent CPU load", () => {
  const now = Date.parse("2026-10-24T00:01:00Z")
  expect(workerHealth({ status: "1", lastHeartbeat: "2026-10-24T00:00:00" }, now)).toBe("online")
  expect(workerHealth({ status: "1", lastHeartbeat: "2026-10-23T23:59:59Z" }, now)).toBe("stale")
  expect(workerHealth({ status: "1", lastHeartbeat: null }, now)).toBe("unknown")
  expect(workerHealth({ status: "2", lastHeartbeat: "2026-10-24T00:01:00Z" }, now)).toBe("offline")
  expect(workerCapacity(5, 4)).toEqual({ percent: 125, available: 0, overCapacity: true })
  expect(workerCapacity(0, 0)).toEqual({ percent: null, available: null, overCapacity: false })
})
test("pool resizing accepts integer 1..10 and never shrinks all current processes", () => {
  expect(validResize(1, 4, "grow")).toBe(true)
  expect(validResize(10, 4, "grow")).toBe(true)
  expect(validResize(3, 4, "shrink")).toBe(true)
  for (const value of [null, 0, -1, 1.5, 11, NaN]) expect(validResize(value, 4, "grow")).toBe(false)
  expect(validResize(4, 4, "shrink")).toBe(false)
  expect(validResize(1, 0, "shrink")).toBe(false)
})
test("optional OpenAPI worker fields normalize without assertions and preserve unknown environment values", () => {
  const worker = normalizeWorker({
    id: "worker",
    hostname: "host",
    createTime: "",
    updateTime: "",
    activeQueues: ["main", false, { name: "secret" }],
    softwareInfo: { nested: { version: 1 } },
  })
  expect(worker).toMatchObject({
    status: "1",
    activeQueues: ["main"],
    concurrency: 0,
    activeTaskCount: 0,
    processedCount: 0,
    lastHeartbeat: null,
    softwareInfo: { nested: { version: 1 } },
  })
})
test("ranking and failed-task navigation preserve an exact UTC window and records view", () => {
  const now = Date.parse("2026-10-24T00:00:00Z")
  const location = queueRecordLocation(7, { task: "plugins.example" }, now),
    query = new URLSearchParams(location.search)
  expect(location.pathname).toBe("/queue/task")
  expect(Object.fromEntries(query)).toEqual({
    view: "records",
    range: "custom",
    startTime: "2026-10-17T00:00:00.000Z",
    endTime: "2026-10-24T00:00:00.000Z",
    task: "plugins.example",
  })
  expect(new URLSearchParams(queueRecordLocation(1, { status: "4" }, now).search).get("status")).toBe("4")
})
test("malformed worker status events are rejected before entering query state", () => {
  const event = {
    hostname: "host",
    status: "1",
    concurrency: 4,
    activeTaskCount: 1,
    processedCount: 10,
    activeQueues: ["main"],
    lastHeartbeat: "2026-10-24T00:00:00Z",
  }
  expect(workerStatusEvent.safeParse(event).success).toBe(true)
  expect(workerStatusEvent.safeParse({ ...event, status: "unexpected" }).success).toBe(false)
  expect(workerStatusEvent.safeParse({ ...event, activeQueues: [{}] }).success).toBe(false)
})

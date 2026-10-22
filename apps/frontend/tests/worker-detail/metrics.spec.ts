import { expect, it } from "vitest"
import { workerHealth, workerCapacity, validResize } from "../../src/views/queue/dashboard/composables/worker-detail"
const now = Date.parse("2026-10-09T10:00:00Z")
it("distinguishes offline, missing heartbeat and expired heartbeat", () => {
  expect(workerHealth({ status: "1", lastHeartbeat: new Date(now - 30000).toISOString() }, now)).toBe("online")
  expect(workerHealth({ status: "1", lastHeartbeat: new Date(now - 61000).toISOString() }, now)).toBe("stale")
  expect(workerHealth({ status: "1", lastHeartbeat: null }, now)).toBe("unknown")
  expect(workerHealth({ status: "2", lastHeartbeat: new Date(now).toISOString() }, now)).toBe("offline")
})
it("keeps zero capacity unknown and exposes over-capacity without negative free slots", () => {
  expect(workerCapacity(0, 0)).toEqual({ percent: null, available: null, overCapacity: false })
  expect(workerCapacity(3, 8)).toEqual({ percent: 37.5, available: 5, overCapacity: false })
  expect(workerCapacity(10, 8)).toEqual({ percent: 125, available: 0, overCapacity: true })
})
it("rejects null, fractional and excessive resize increments, and zero remaining slots", () => {
  for (const n of [null, 0, -1, 1.5, 11, NaN]) expect(validResize(n, 8, "grow")).toBe(false)
  expect(validResize(8, 8, "shrink")).toBe(false)
  expect(validResize(1, 1, "shrink")).toBe(false)
  expect(validResize(1, 8, "grow")).toBe(true)
  expect(validResize(7, 8, "shrink")).toBe(true)
})

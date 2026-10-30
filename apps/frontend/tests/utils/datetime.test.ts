import { expect, it } from "vitest"
import { formatApiTime, parseApiTime } from "../../src/utils/datetime"

it("distinguishes legacy UTC from legacy platform wall times", () => {
  expect(parseApiTime("2026-10-29T08:00:00", "UTC").toISOString()).toBe("2026-10-29T08:00:00.000Z")
  expect(parseApiTime("2026-10-29 16:00:00", "Asia/Shanghai").toISOString()).toBe("2026-10-29T08:00:00.000Z")
  expect(parseApiTime("2026-10-29T16:00:00+08:00", "America/New_York").toISOString()).toBe("2026-10-29T08:00:00.000Z")
})

it("preserves event-time platform offsets and calendar date labels", () => {
  expect(formatApiTime("2026-10-29T16:00:00+08:00")).toBe("2026-10-29 16:00:00")
  expect(formatApiTime("2026-10-29T08:00:00Z", "Asia/Shanghai")).toBe("2026-10-29 16:00:00")
  expect(formatApiTime("2026-11-01T01:30:00-04:00")).toBe("2026-11-01 01:30:00")
  expect(formatApiTime("2026-10-29", "America/New_York")).toBe("2026-10-29")
})

it("treats missing or malformed timestamps as unavailable", () => {
  expect(formatApiTime(null)).toBe("—")
  expect(formatApiTime("unavailable", "Asia/Shanghai")).toBe("—")
  expect(parseApiTime("unavailable", "Asia/Shanghai").isValid()).toBe(false)
})

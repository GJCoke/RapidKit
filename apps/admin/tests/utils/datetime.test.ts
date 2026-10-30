import { expect, it } from "vitest"
import { formatPlatformTime, platformDateRange } from "@/utils/datetime"

it("formats explicit instants in platform time, retaining legacy wall labels", () => {
  const instant = "2026-10-30T16:30:00Z"
  expect(formatPlatformTime(instant, "Asia/Shanghai", "en-GB")).toContain("31 Oct 2026")
  expect(formatPlatformTime(instant, "Asia/Shanghai", "en-GB")).toContain("00:30")
  expect(formatPlatformTime("2026-10-31 00:30:00", "Asia/Shanghai", "en-GB")).toContain("00:30")
  expect(formatPlatformTime("invalid", "Asia/Shanghai", "en-GB")).toBe("—")
})

it("selects thirty platform calendar dates across midnight and DST", () => {
  expect(platformDateRange(new Date("2026-10-30T16:30:00Z"), "Asia/Shanghai")).toEqual({
    start: "2026-10-02",
    end: "2026-10-31",
    granularity: "day",
  })
  expect(platformDateRange(new Date("2026-03-29T22:30:00Z"), "Europe/Berlin")).toEqual({
    start: "2026-03-01",
    end: "2026-03-30",
    granularity: "day",
  })
})

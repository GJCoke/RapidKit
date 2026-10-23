import { expect, test } from "vitest"
import {
  createScheduleDraft,
  selectSchedule,
  encodeSchedule,
  validInterval,
  validSolar,
  displayScheduleTime,
} from "@/shared/schedule-editor/schedule-model"
test("new schedules default to a sixty-second interval and preserve every type's draft, including invalid Cron", () => {
  let draft = createScheduleDraft()
  expect(encodeSchedule(draft).value).toEqual({ type: "interval", every: 60, period: "seconds" })
  draft = { ...selectSchedule(draft, "crontab"), crontab: { ...draft.crontab, mode: "advanced", expression: "1 2 3" } }
  expect(encodeSchedule(draft).error).toBe("fields")
  const solar = {
    ...selectSchedule(draft, "solar"),
    solar: { event: "sunset" as const, latitude: -31.25, longitude: 121.5 },
  }
  const restored = selectSchedule(solar, "crontab")
  expect(restored.crontab.expression).toBe("1 2 3")
  expect(encodeSchedule(restored).error).toBe("fields")
  expect(encodeSchedule(selectSchedule(restored, "solar")).value).toEqual({
    type: "solar",
    event: "sunset",
    latitude: -31.25,
    longitude: 121.5,
  })
  expect(createScheduleDraft().crontab.expression).toBe("* * * * *")
})
test("a new external schedule starts fresh drafts and retains a loaded noncanonical Crontab", () => {
  const loaded = createScheduleDraft({
    type: "crontab",
    minute: "00",
    hour: "09",
    dayOfMonth: "*",
    monthOfYear: "*",
    dayOfWeek: "1,2,3,4,5",
  })
  expect(loaded.kind).toBe("crontab")
  expect(loaded.crontab.mode).toBe("advanced")
  expect(encodeSchedule(loaded).value).toMatchObject({ minute: "00", hour: "09", dayOfWeek: "1,2,3,4,5" })
  expect(loaded.interval).toEqual({ every: 60, period: "seconds" })
  expect(loaded.solar).toEqual({ event: "sunrise", latitude: 0, longitude: 0 })
})
test("all seven interval units enforce positive integer and Python timedelta bounds without coercing empty input", () => {
  for (const every of [null, 0, -1, 1.5, Infinity, NaN, 2147483648])
    expect(validInterval({ every, period: "seconds" })).toBe(false)
  for (const period of ["seconds", "minutes", "hours", "milliseconds", "microseconds"] as const)
    expect(validInterval({ every: 2147483647, period })).toBe(true)
  expect(validInterval({ every: 999999999, period: "days" })).toBe(true)
  expect(validInterval({ every: 1000000000, period: "days" })).toBe(false)
  expect(validInterval({ every: 142857142, period: "weeks" })).toBe(true)
  expect(validInterval({ every: 142857143, period: "weeks" })).toBe(false)
})
test("solar coordinates accept both poles/hemispheres but reject null, NaN, infinite and out-of-range values", () => {
  expect(validSolar({ event: "sunrise", latitude: -90, longitude: 180 })).toBe(true)
  expect(validSolar({ event: "solar_noon", latitude: 31.2304, longitude: -121.4737 })).toBe(true)
  for (const latitude of [null, NaN, Infinity, 90.001])
    expect(validSolar({ event: "sunrise", latitude, longitude: 0 })).toBe(false)
  for (const longitude of [null, NaN, -Infinity, -180.001])
    expect(validSolar({ event: "sunrise", latitude: 0, longitude })).toBe(false)
})
test("preview timestamps stay in the server's printed timezone and preserve fractional precision for subsecond schedules", () => {
  expect(displayScheduleTime("2026-11-01T01:30:00.123456-05:00", true)).toBe("2026-11-01 01:30:00.123456")
  expect(displayScheduleTime("2026-11-01T01:30:00.123456-05:00")).toBe("2026-11-01 01:30:00")
  expect(displayScheduleTime("2026-11-01T06:30:00Z")).toBe("2026-11-01 06:30:00")
})

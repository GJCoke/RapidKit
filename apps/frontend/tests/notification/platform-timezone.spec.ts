import { afterEach, expect, it, vi } from "vitest"
import { isNotificationActionable } from "@/utils/notification/state"
import * as datetime from "@/utils/datetime"

afterEach(() => {
  vi.restoreAllMocks()
  datetime.setPlatformTimezone("UTC")
})

it("expires the legacy platform-wall timestamp regardless of browser zone", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-30T08:01:00Z"))
  const message = {
    status: "published",
    expireAt: "2026-10-30 16:00:00",
    action: { type: "external", url: "https://example.com" },
  } as Api.Notification.Message
  // The platform is Shanghai; the browser running this suite is UTC or New York.
  datetime.setPlatformTimezone("Asia/Shanghai")
  expect(isNotificationActionable(message)).toBe(false)
})

it.each([
  ["2026-10-30T08:00:00Z", false],
  ["2026-10-30T16:00:00+08:00", false],
  ["2026-10-30T08:00:01Z", true],
  ["invalid", false],
  [null, true],
])("checks expiry boundary without losing recall guards: %s", (expireAt, actionable) => {
  datetime.setPlatformTimezone("Asia/Shanghai")
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-30T08:00:00Z"))
  const message = {
    status: "published",
    expireAt,
    action: { type: "external", url: "https://example.com" },
  } as Api.Notification.Message
  expect(isNotificationActionable(message)).toBe(actionable)
  expect(isNotificationActionable({ ...message, status: "recalled" })).toBe(false)
})

it("uses the platform zone for offset-bearing and legacy display values", () => {
  datetime.setPlatformTimezone("Asia/Shanghai")
  expect(datetime.getPlatformTimezone()).toBe("Asia/Shanghai")
  expect(datetime.formatApiTime("2026-10-30T08:00:00Z")).toBe("2026-10-30 16:00:00")
  expect(datetime.formatApiTime("2026-10-30T04:00:00-04:00")).toBe("2026-10-30 16:00:00")
  expect(datetime.parseApiTime("2026-10-30 16:00:00").toISOString()).toBe("2026-10-30T08:00:00.000Z")
  datetime.setPlatformTimezone("Europe/Berlin")
  expect(datetime.formatApiTime("2026-10-30T08:00:00Z")).toBe("2026-10-30 09:00:00")
})

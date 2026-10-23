import { expect, test } from "vitest"
import { formatNotificationTime } from "@/features/notifications/notification-presentation"

test("compact message times show relative recency and older group times while full messages keep an exact timestamp", () => {
  const now = new Date(2026, 9, 23, 10, 0, 0).getTime()
  expect(formatNotificationTime(new Date(2026, 9, 23, 9, 55).toISOString(), "en-US", now, true)).toBe("5 minutes ago")
  expect(formatNotificationTime(new Date(2026, 9, 22, 8, 30).toISOString(), "en-US", now, true)).toBe("08:30")
  expect(formatNotificationTime(new Date(2026, 9, 23, 9, 55).toISOString(), "en-US", now, false)).toBe(
    "2026-10-23 09:55:00",
  )
  expect(formatNotificationTime("not-a-date", "en-US", now, true)).toBe("not-a-date")
})

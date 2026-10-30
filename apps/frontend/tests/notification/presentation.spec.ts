import { describe, expect, it } from "vitest"
import { formatNotificationTime, groupNotifications } from "@/utils/notification/presentation"

const now = Date.parse("2026-01-01T12:00:00Z")
const message = (id: string, createTime: string) => ({ id, createTime })

describe("notification popover dates", () => {
  it("groups newest first using local calendar days across a year boundary without mutating input", () => {
    const items = [
      message("older", "2025-12-20T12:00:00"),
      message("yesterday", "2025-12-31T23:59:00"),
      message("morning", "2026-01-01T08:00:00"),
      message("latest", "2026-01-01T11:00:00"),
    ]
    const groups = groupNotifications(items, now.valueOf())
    expect(groups.map((group) => group.period)).toEqual(["today", "yesterday", "date"])
    expect(groups[0].items.map((item) => item.id)).toEqual(["latest", "morning"])
    expect(groups[1].date).toBe("2025-12-31")
    expect(items[0].id).toBe("older")
  })

  it("returns no groups for an empty inbox", () => {
    expect(groupNotifications([], now.valueOf())).toEqual([])
  })

  it("formats recent times in both locales and keeps older dates unambiguous", () => {
    expect(formatNotificationTime("2026-01-01T11:50:00", "zh-CN", now.valueOf())).toBe("10分钟前")
    expect(formatNotificationTime("2026-01-01T11:00:00", "en-US", now.valueOf())).toBe("1 hour ago")
    expect(formatNotificationTime("2025-12-20T12:00:00", "zh-CN", now.valueOf())).toBe("2025-12-20 12:00")
  })

  it("does not mislabel future or invalid timestamps as just received", () => {
    expect(formatNotificationTime("2026-01-01T13:00:00", "en-US", now.valueOf())).toBe("2026-01-01 13:00")
    expect(formatNotificationTime("invalid", "en-US", now.valueOf())).toBe("invalid")
  })
})

import { afterEach, expect, it } from "vitest"
import { setPlatformTimezone } from "@/utils/datetime"
import {
  buildAnnouncementPayload,
  createAnnouncementState,
} from "@/views/notification/manage/announcements/modules/announcement-editor"
import { groupNotifications, formatNotificationTime } from "@/utils/notification/presentation"

afterEach(() => setPlatformTimezone("UTC"))

function form() {
  const state = createAnnouncementState()
  state.audienceMode = "all"
  state.model.rawTitle = "Maintenance"
  state.model.rawContent = "Content"
  state.delivery = "scheduled"
  return state
}

it("treats publish and expiry as platform calendar fields, including a browser DST gap", () => {
  setPlatformTimezone("Asia/Shanghai")
  const state = form()
  state.model.publishAt = "2026-03-08T02:30"
  state.expires = true
  state.model.expireAt = "2026-03-08T03:30:00"
  expect(buildAnnouncementPayload(state, "publish", Date.parse("2026-03-07T00:00:00Z"))).toMatchObject({
    publishAt: "2026-03-07T18:30:00.000Z",
    expireAt: "2026-03-07T19:30:00.000Z",
  })
})

it("rejects nonexistent platform wall times", () => {
  setPlatformTimezone("Europe/Berlin")
  const state = form()
  state.model.publishAt = "2026-03-29T02:30:00"
  expect(() => buildAnnouncementPayload(state, "publish", Date.parse("2026-03-28T00:00:00Z"))).toThrow(
    "publishAtInvalid",
  )
})

it("preserves an unchanged repeated-hour instant when editing", () => {
  setPlatformTimezone("America/New_York")
  const state = form()
  state.model.publishAt = "2026-11-01T01:30:00"
  state.originalTimes = { publishAt: "2026-11-01T01:30:00-05:00", expireAt: null }
  expect(buildAnnouncementPayload(state, "draft", Date.parse("2026-10-30T00:00:00Z")).publishAt).toBe(
    "2026-11-01T06:30:00.000Z",
  )
})

it("groups explicit instants at platform midnight and computes age from the instant", () => {
  setPlatformTimezone("Asia/Shanghai")
  const now = Date.parse("2026-10-30T16:01:00Z")
  const items = [
    { id: "today", createTime: "2026-10-30T16:00:00Z" },
    { id: "yesterday", createTime: "2026-10-30T15:59:59Z" },
  ]
  const groups = groupNotifications(items, now)
  expect(groups.map(({ date, period }) => [date, period])).toEqual([
    ["2026-10-31", "today"],
    ["2026-10-30", "yesterday"],
  ])
  expect(formatNotificationTime(items[0].createTime, "en-US", now)).toBe("1 minute ago")
  expect(formatNotificationTime("2026-10-29T08:00:00Z", "en-US", now)).toBe("2026-10-29 16:00")
})

it("uses the first occurrence for a new repeated time and preserves unchanged milliseconds", () => {
  setPlatformTimezone("America/New_York")
  const state = form()
  state.model.publishAt = "2026-11-01T01:30:00"
  expect(buildAnnouncementPayload(state, "draft", Date.parse("2026-10-30T00:00:00Z")).publishAt).toBe(
    "2026-11-01T05:30:00.000Z",
  )
  state.originalTimes.publishAt = "2026-11-01T01:30:00.123-05:00"
  expect(buildAnnouncementPayload(state, "draft", Date.parse("2026-10-30T00:00:00Z")).publishAt).toBe(
    "2026-11-01T06:30:00.123Z",
  )
})

it("uses Berlin summer and winter offsets and rejects a nonexistent expiry", () => {
  setPlatformTimezone("Europe/Berlin")
  const state = form()
  state.model.publishAt = "2026-07-01T12:00:00"
  expect(buildAnnouncementPayload(state, "draft", 0).publishAt).toBe("2026-07-01T10:00:00.000Z")
  state.model.publishAt = "2026-01-01T12:00:00"
  expect(buildAnnouncementPayload(state, "draft", 0).publishAt).toBe("2026-01-01T11:00:00.000Z")
  state.expires = true
  state.model.expireAt = "2026-03-29T02:30:00"
  expect(() => buildAnnouncementPayload(state, "draft", 0)).toThrow("expireAtInvalid")
})

import { expect, test } from "vitest"
import type { Delivery, DeliveryMessage, DeliveryRecipient } from "@/services/api/notification-delivery"
import {
  normalizeDeliveryMessageId,
  deliveryMessageTitle,
  deliveryRecipientName,
  deliveryRecipientSubtitle,
  deliveryOutcomeTime,
  deliveryErrorKey,
  retryMessageAllowed,
} from "@/views/notification/manage/deliveries/modules/delivery-model"
const message: DeliveryMessage = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Original",
  category: "admin.announcement",
  contentMode: "raw",
  status: "published",
  titles: {},
  createTime: "2026-10-01T00:00:00",
}
const recipient: DeliveryRecipient = { name: "Ada", username: "ada", department: "Platform", state: "active" }
const row: Delivery = {
  id: "delivery",
  messageId: message.id,
  userId: "user",
  channel: "in_app",
  status: "sent",
  attemptCount: 2,
  createTime: "2026-10-01T00:00:00",
  updateTime: "2026-10-02T00:00:00",
  recipient,
}
test("message IDs trim and normalize UUID versions 1-8 while invalid input never becomes query state", () => {
  expect(normalizeDeliveryMessageId("  AAAAAAAA-0000-4000-8000-000000000001 ")).toBe(
    "aaaaaaaa-0000-4000-8000-000000000001",
  )
  for (const value of ["", "not-an-id", "00000000-0000-0000-0000-000000000000", "aaaaaaaa-0000-9000-8000-000000000001"])
    expect(normalizeDeliveryMessageId(value)).toBeNull()
})
test("recipient presentation handles deleted, unavailable, blank and stateful profile information", () => {
  const t = (key: string) => key
  expect(deliveryRecipientName(undefined, t)).toBe("recipientUnavailable")
  expect(deliveryRecipientName({ ...recipient, state: "deleted" }, t)).toBe("userDeleted")
  expect(deliveryRecipientName({ ...recipient, name: " ", username: " ada " }, t)).toBe("ada")
  expect(deliveryRecipientName({ ...recipient, name: "", username: "" }, t)).toBe("unnamedUser")
  expect(deliveryRecipientSubtitle(row.recipient)).toBe("@ada · Platform")
  expect(deliveryRecipientSubtitle({ ...recipient, state: "deleted" })).toBe("")
})
test("message titles follow active locale, default locale and raw fallback, and delegate i18n text safely", () => {
  const local = {
    ...message,
    contentMode: "local",
    titles: { "zh-CN": "中文标题", "en-US": "English title" },
    defaultLocale: "zh-CN",
  }
  expect(deliveryMessageTitle(local, "en-US", (key) => key)).toBe("English title")
  expect(deliveryMessageTitle(local, "fr", (key) => key)).toBe("中文标题")
  expect(deliveryMessageTitle({ ...local, titles: {} }, "en-US", (key) => key)).toBe("Original")
  expect(
    deliveryMessageTitle(
      { ...message, contentMode: "i18n", title: "notice.title", titleParams: { name: "Ada" } },
      "en-US",
      (key, params) => `${key}:${params?.name}`,
    ),
  ).toBe("notice.title:Ada")
})
test("outcome timestamps use the correct status-specific event, with update time displayed only once", () => {
  expect(deliveryOutcomeTime({ ...row, sentAt: "sent" })).toEqual({ label: "sentAt", value: "sent", isUpdated: false })
  expect(deliveryOutcomeTime({ ...row, status: "pending", nextAttemptAt: "next" })).toEqual({
    label: "outcome.plannedAt",
    value: "next",
    isUpdated: false,
  })
  expect(deliveryOutcomeTime({ ...row, status: "retrying", nextAttemptAt: "next" })).toEqual({
    label: "nextAttemptAt",
    value: "next",
    isUpdated: false,
  })
  expect(deliveryOutcomeTime({ ...row, status: "dead" })).toEqual({
    label: "outcome.lastUpdated",
    value: row.updateTime,
    isUpdated: true,
  })
  expect(deliveryErrorKey("inapp_emit_failed")).toBe("emitFailed")
  expect(deliveryErrorKey("unknown_channel")).toBe("unknownChannel")
  expect(deliveryErrorKey("private stack text")).toBe("deliveryFailed")
})
test("retry eligibility respects message lifecycle and naive UTC expiration without excluding an unavailable message", () => {
  const now = Date.parse("2030-01-01T12:00:00Z")
  expect(retryMessageAllowed(null, now)).toBe(true)
  expect(retryMessageAllowed({ ...message, status: "recalled" }, now)).toBe(false)
  expect(retryMessageAllowed({ ...message, expireAt: "2030-01-01T12:00:00" }, now)).toBe(false)
  expect(retryMessageAllowed({ ...message, expireAt: "2030-01-01T12:00:01" }, now)).toBe(true)
  expect(retryMessageAllowed({ ...message, expireAt: "invalid" }, now)).toBe(false)
})

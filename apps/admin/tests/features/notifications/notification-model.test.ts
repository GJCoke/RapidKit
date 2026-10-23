import { expect, test } from "vitest"
import { normalizeRoutes } from "@/features/router/route-model"
import {
  renderNotification,
  notificationActionLabel,
  resolveNotificationAction,
  sanitizeNotification,
  isNotificationActionable,
  currentBanner,
} from "@/features/notifications/notification-model"
import type { NotificationMessage } from "@/services/api/notification"

const message: NotificationMessage = {
  id: "inbox",
  messageId: "message",
  contentMode: "raw",
  title: "Secret title",
  content: "Secret body",
  level: "info",
  category: "system.security",
  mandatory: false,
  status: "published",
  createTime: "2026-10-23T08:00:00Z",
  action: { type: "route", route: "manage_user" },
}
test("recalled notifications remove content, interpolation and actions even from late HTTP snapshots", () => {
  const recalled = sanitizeNotification(message, new Set(["message"]))
  expect(recalled).toMatchObject({
    status: "recalled",
    title: "",
    content: "",
    contentMode: "raw",
    contentParams: null,
    action: null,
    mandatory: false,
  })
  expect(isNotificationActionable(recalled)).toBe(false)
  expect(isNotificationActionable({ ...message, status: "expired" })).toBe(false)
  expect(isNotificationActionable({ ...message, expireAt: "2000-01-01" })).toBe(false)
})
test("localized notification content falls back as one complete language and substitutes literal values", () => {
  const localized = {
    ...message,
    contentMode: "local",
    contentParams: {
      defaultLocale: "zh-CN",
      translations: {
        "zh-CN": { title: "你好 {name}", content: "第{count}次 {missing}" },
        "en-US": { title: "Hello", content: "" },
      },
      parameters: { name: "$&<x>", count: 0 },
    },
  }
  expect(renderNotification(localized, "en-US", (text: string) => text)).toEqual({
    title: "你好 $&<x>",
    content: "第0次 {missing}",
  })
  expect(
    notificationActionLabel(
      { localized_label: { default_locale: "zh-CN", translations: { "zh-CN": "查看", "en-US": " " } }, label: "Open" },
      "en-US",
    ),
  ).toBe("查看")
  expect(
    renderNotification(
      { ...message, contentMode: "i18n", title: "title-key" },
      "en-US",
      (key: string) => `translated:${key}`,
    ).title,
  ).toBe("translated:title-key")
})
test("actions resolve only authorized routes with matching menu snapshots and safe external URLs", () => {
  const routes = normalizeRoutes([{ name: "manage_user", path: "/manage/user/:id", component: "view.manage_user" }])
  expect(
    resolveNotificationAction(
      { type: "menu", route: "manage_user", path: "/manage/user/a%2Fb", params: { id: "a/b" }, query: { page: 2 } },
      routes,
    ),
  ).toEqual({ href: "/manage/user/a%2Fb?page=2", external: false })
  expect(
    resolveNotificationAction(
      { type: "menu", route: "manage_user", path: "/manage/user/other", params: { id: "a/b" } },
      routes,
    ),
  ).toBeNull()
  expect(resolveNotificationAction({ type: "route", route: "forbidden" }, routes)).toBeNull()
  expect(resolveNotificationAction({ type: "route", route: "manage_user", params: { id: true } }, routes)).toBeNull()
  for (const url of [
    "javascript:alert(1)",
    "//example.com",
    "https://user:pass@example.com",
    "https://example.com\\x",
    "https://example.com\n/x",
  ])
    expect(resolveNotificationAction({ type: "external", url }, routes)).toBeNull()
  expect(resolveNotificationAction({ type: "external", url: "https://example.com/path" }, routes)).toEqual({
    href: "https://example.com/path",
    external: true,
  })
})
test("banner boundaries and revision invalidation hide stale or expired banners using server time", () => {
  const current = {
    id: "banner",
    title: "Title",
    content: "Body",
    level: "info" as const,
    contentMode: "raw",
    status: "published",
    publishAt: "2026-10-23T08:00:00Z",
    expireAt: "2026-10-23T09:00:00Z",
  }
  const snapshot = { current, revision: 3, serverNow: "2026-10-23T08:00:00Z", nextChangeAt: "2026-10-23T09:00:00Z" }
  expect(currentBanner(snapshot, 3, Date.parse("2026-10-23T08:30:00Z"))).toEqual(current)
  expect(currentBanner(snapshot, 4, Date.parse("2026-10-23T08:30:00Z"))).toBeNull()
  expect(currentBanner(snapshot, 3, Date.parse("2026-10-23T09:00:00Z"))).toBeNull()
  expect(currentBanner(snapshot, 3, Date.parse("2026-10-23T07:59:00Z"))).toBeNull()
})

test("legacy controlled route actions emitted without a type still resolve authorized path parameters", () => {
  const routes = normalizeRoutes([{ name: "manage_user", path: "/manage/user/:id", component: "view.manage_user" }])
  expect(resolveNotificationAction({ route: "manage_user", params: { id: "reader" } }, routes)).toEqual({
    href: "/manage/user/reader",
    external: false,
  })
  expect(resolveNotificationAction({ type: null, route: "manage_user", params: { id: "reader" } }, routes)).toEqual({
    href: "/manage/user/reader",
    external: false,
  })
})

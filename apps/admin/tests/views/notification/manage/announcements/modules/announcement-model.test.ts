import { expect, test } from "vitest"
import type { AnnouncementDetail, AnnouncementActionTarget } from "@/services/api/announcement"
import type { NotificationTemplate } from "@/services/api/notification-template"
import {
  emptyAnnouncementForm,
  buildAnnouncementPayload,
  buildAnnouncementAction,
  templateVariables,
  restoreAnnouncementForm,
  announcementActions,
  bannerPublication,
} from "@/views/notification/manage/announcements/modules/announcement-model"

const now = Date.parse("2026-10-23T08:00:00Z")
const template: NotificationTemplate = {
  id: "template",
  code: "welcome",
  name: "Welcome",
  category: "user.invited",
  level: "info",
  contentMode: "raw",
  titleTemplate: "Welcome {name}",
  contentTemplate: "Count {count}",
  variableSchema: {
    name: { type: "string", required: true, example: "EXAMPLE" },
    count: { type: "integer", required: true, example: 99 },
  },
  defaultChannels: ["in_app"],
  mandatory: false,
  enabled: true,
  version: 1,
  createTime: "",
  updateTime: "",
}
const target: AnnouncementActionTarget = {
  menuId: "menu",
  route: "manage_user",
  path: "/manage/user/:id",
  label: "Users",
  breadcrumb: ["Manage", "Users"],
  parameters: [
    { name: "id", location: "path", required: true },
    { name: "keyword", location: "query", required: false, defaultValue: "active" },
  ],
}
function raw() {
  return { ...emptyAnnouncementForm(), rawTitle: "Notice", rawContent: "Body" }
}
function options() {
  return { now }
}

test("immediate inbox publication first persists a draft, while scheduled payloads use UTC wall timestamps", () => {
  const form = raw()
  expect(buildAnnouncementPayload(form, "publish", options())).toMatchObject({
    displayMode: "inbox",
    saveAsDraft: true,
    channels: ["in_app"],
    publishAt: null,
    action: null,
  })
  form.delivery = "scheduled"
  form.publishAt = "2026-10-24T16:00:00+08:00"
  form.expires = true
  form.expireAt = "2026-10-25T16:00:00+08:00"
  expect(buildAnnouncementPayload(form, "publish", options())).toMatchObject({
    saveAsDraft: false,
    publishAt: "2026-10-24T08:00:00",
    expireAt: "2026-10-25T08:00:00",
  })
  expect(buildAnnouncementPayload(form, "draft", options()).saveAsDraft).toBe(true)
})
test("required content and invalid schedule or expiry cannot produce a payload", () => {
  const form = raw()
  form.rawTitle = " "
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("titleRequired")
  form.rawTitle = "Notice"
  form.delivery = "scheduled"
  form.publishAt = "2026-10-22T00:00:00Z"
  expect(() => buildAnnouncementPayload(form, "publish", options())).toThrow("publishAtFuture")
  form.publishAt = "2026-10-24T08:00:00Z"
  form.expires = true
  form.expireAt = "2026-10-24T07:00:00Z"
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("expireAtInvalid")
})
test("Unicode limits count supplementary characters once rather than UTF-16 units", () => {
  const form = raw()
  form.rawTitle = "😀".repeat(256)
  expect(buildAnnouncementPayload(form, "draft", options()).rawTitle).toHaveLength(512)
  form.rawTitle += "😀"
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("titleTooLong")
})
test("selected audiences retain role codes, department descendants and user IDs; empty selections are rejected", () => {
  const form = raw()
  form.audienceMode = "selected"
  form.audiences = [
    { type: "role", value: " reader ", includeDescendants: true },
    { type: "department", value: "dept", includeDescendants: true },
  ]
  expect(buildAnnouncementPayload(form, "draft", options()).audience).toEqual([
    { type: "role", value: "reader", includeDescendants: false },
    { type: "department", value: "dept", includeDescendants: true },
  ])
  form.audiences = [{ type: "user", value: "", includeDescendants: false }]
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("audienceRequired")
})
test("template examples never become actual values and recipient bindings only accept string declarations", () => {
  const form = raw()
  form.contentSource = "template"
  form.templateCode = "welcome"
  form.variables = templateVariables(template)
  expect(form.variables.map((row) => row.value)).toEqual(["", ""])
  expect(() => buildAnnouncementPayload(form, "draft", { ...options(), template })).toThrow("variablesRequired")
  form.variables[0]!.source = "name"
  form.variables[1]!.value = "3"
  expect(buildAnnouncementPayload(form, "draft", { ...options(), template })).toMatchObject({
    templateVariables: { count: 3 },
    variableBindings: { name: { source: "recipient", field: "name" } },
  })
  form.variables[1]!.source = "roles"
  expect(() => buildAnnouncementPayload(form, "draft", { ...options(), template })).toThrow("bindingsInvalid")
})
test.each(["0x10", "1.5", "9007199254740992", "Infinity"])("integer template values reject %s", (value) => {
  const form = raw()
  form.contentSource = "template"
  form.templateCode = "welcome"
  form.variables = templateVariables(template, { name: "Reader", count: value })
  expect(() => buildAnnouncementPayload(form, "draft", { ...options(), template })).toThrow("variablesInvalid")
})
test("localized content requires complete default and optional language pairs, and sends typed shared parameters", () => {
  const form = raw()
  form.contentSource = "local"
  form.localized.translations["zh-CN"] = { title: "通知 {count}", content: "内容 {flag}" }
  form.localized.parameters = { count: { type: "number", value: "2" }, flag: { type: "boolean", value: "false" } }
  expect(buildAnnouncementPayload(form, "draft", options()).localizedContent).toEqual({
    defaultLocale: "zh-CN",
    translations: { "zh-CN": { title: "通知 {count}", content: "内容 {flag}" } },
    parameters: { count: 2, flag: false },
  })
  form.localized.translations["en-US"].title = "Notice"
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("localizedPartial")
  form.localized.translations["en-US"].content = "Body"
  form.localized.parameters.flag!.value = "no"
  expect(() => buildAnnouncementPayload(form, "draft", options())).toThrow("localizedValuesInvalid")
})
test("menu actions use current descriptor defaults and reject missing or unknown parameters without snapshots", () => {
  const form = raw()
  form.action.type = "menu"
  form.action.menuId = "menu"
  expect(() => buildAnnouncementAction(form, target)).toThrow("actionParametersRequired")
  form.action.params = { id: " 42 " }
  expect(buildAnnouncementAction(form, target)).toEqual({
    type: "menu",
    menuId: "menu",
    params: { id: "42" },
    query: { keyword: "active" },
    label: null,
  })
  form.action.query = { old: "stale" }
  expect(() => buildAnnouncementAction(form, target)).toThrow("actionParametersUnknown")
  expect(buildAnnouncementAction(form)).toMatchObject({ params: { id: "42" }, query: { old: "stale" } })
})
test.each(["javascript:alert(1)", "https://u:p@example.com", "https://example.com/a\\b", "https://example.com/a b"])(
  "external actions reject unsafe destination %s",
  (url) => {
    const form = raw()
    form.action.type = "external"
    form.action.url = url
    expect(() => buildAnnouncementAction(form)).toThrow("actionUrlInvalid")
  },
)
test("localized buttons require the default label and honor the 64-codepoint limit", () => {
  const form = raw()
  form.contentSource = "local"
  form.action.type = "external"
  form.action.url = "https://example.com"
  expect(() => buildAnnouncementAction(form)).toThrow("actionLabelDefaultRequired")
  form.action.labels["zh-CN"] = "😀".repeat(64)
  expect(buildAnnouncementAction(form)?.localizedLabel?.translations["zh-CN"]).toBe("😀".repeat(64))
  form.action.labels["en-US"] = "x".repeat(65)
  expect(() => buildAnnouncementAction(form)).toThrow("actionLabelTooLong")
})
test("banner payloads ignore inbox scopes, omit deliveries and reject per-recipient variables", () => {
  const form = raw()
  form.displayMode = "top_banner"
  form.mandatory = true
  form.audienceMode = "selected"
  form.audiences = []
  expect(buildAnnouncementPayload(form, "publish", options())).toMatchObject({
    audience: [{ type: "all", includeDescendants: false }],
    mandatory: false,
    channels: [],
    saveAsDraft: false,
  })
  form.contentSource = "template"
  form.templateCode = "welcome"
  form.variables = templateVariables(template, { count: 2 })
  form.variables[0]!.source = "name"
  expect(() => buildAnnouncementPayload(form, "publish", { ...options(), template })).toThrow("bannerManualOnly")
})
test("banner confirmation carries the reviewed revision, distinguishes current and upcoming replacement, and preserves the request ID", () => {
  const form = raw()
  form.displayMode = "top_banner"
  const body = buildAnnouncementPayload(form, "publish", options())
  const current = {
    id: "current",
    title: "Current",
    content: "Body",
    contentMode: "raw",
    level: "info" as const,
    status: "published" as const,
  }
  const check = { revision: 7, serverNow: "2026-10-23T08:00:00Z", current, scheduled: { ...current, id: "plan" } }
  expect(bannerPublication(body, check, null, "nonce")).toMatchObject({
    bannerRevision: 7,
    replaceCurrent: true,
    replaceScheduled: false,
    clientRequestId: "nonce",
    saveAsDraft: false,
  })
  body.publishAt = "2026-10-24T08:00:00"
  expect(bannerPublication(body, check, "plan", "nonce")).toMatchObject({ replaceScheduled: false })
  expect(bannerPublication(body, check, "other", "nonce")).toMatchObject({ replaceScheduled: true })
})
test("copying restores legacy actions and actual template bindings but clears publication identity and time", () => {
  const detail: AnnouncementDetail = {
    id: "old",
    createTime: "",
    updateTime: "",
    source: "admin",
    displayMode: "inbox",
    category: "user.invited",
    level: "info",
    contentMode: "raw",
    title: "Title",
    content: "Body",
    status: "scheduled",
    mandatory: false,
    channels: ["in_app"],
    audiences: [{ type: "user", value: "reader", includeDescendants: false }],
    templateCode: "welcome",
    contentParams: { count: 4 },
    variableBindings: { name: { source: "recipient", field: "name" } },
    publishAt: "2026-10-24T08:00:00Z",
    expireAt: "2026-10-25T08:00:00Z",
    action: { route: "home", params: { id: 3 }, label: "Open" },
  }
  const values = restoreAnnouncementForm(detail, template, true)
  expect(values).toMatchObject({
    delivery: "now",
    expires: false,
    publishAt: "",
    expireAt: "",
    action: { type: "legacy", route: "home", legacyParams: '{\n  "id": 3\n}' },
  })
  expect(values.variables.map((row) => [row.name, row.value, row.source])).toEqual([
    ["name", "", "name"],
    ["count", "4", "manual"],
  ])
})
test("row actions require state-specific permissions and both update and publish for draft publication", () => {
  const allowed = new Set(["notification:read", "notification:create", "notification:publish"])
  const can = (code: string) => allowed.has(code)
  expect(announcementActions({ status: "draft" }, can)).toEqual(["detail", "copy"])
  allowed.add("notification:update")
  allowed.add("notification:delete")
  allowed.add("notification:cancel")
  allowed.add("notification:recall")
  expect(announcementActions({ status: "draft" }, can)).toEqual([
    "detail",
    "edit",
    "copy",
    "publish",
    "cancel",
    "delete",
  ])
  expect(announcementActions({ status: "published" }, can)).toEqual(["detail", "copy", "recall"])
  expect(announcementActions({ status: "superseded" }, can)).toEqual(["detail", "copy"])
})

test("editing naive UTC publication and expiry timestamps preserves the instant in a non-UTC timezone", () => {
  const detail: AnnouncementDetail = {
    id: "scheduled",
    createTime: "",
    updateTime: "",
    source: "admin",
    displayMode: "inbox",
    category: "admin.announcement",
    level: "info",
    contentMode: "raw",
    title: "Notice",
    content: "Body",
    status: "scheduled",
    mandatory: false,
    channels: ["in_app"],
    audiences: [{ type: "all", includeDescendants: false }],
    publishAt: "2030-10-23T08:00:00",
    expireAt: "2030-10-24T08:00:00",
  }
  const restored = restoreAnnouncementForm(detail, null)
  expect(new Date(restored.publishAt).getTime()).toBe(Date.parse("2030-10-23T08:00:00Z"))
  expect(new Date(restored.expireAt).getTime()).toBe(Date.parse("2030-10-24T08:00:00Z"))
  expect(buildAnnouncementPayload(restored, "publish", options())).toMatchObject({
    publishAt: detail.publishAt,
    expireAt: detail.expireAt,
  })
})

test("unchanged schedule and expiry retain their original instant during the second repeated DST hour", () => {
  const detail: AnnouncementDetail = {
    id: "fold",
    createTime: "",
    updateTime: "",
    source: "admin",
    displayMode: "inbox",
    category: "admin.announcement",
    level: "info",
    contentMode: "raw",
    title: "Notice",
    content: "Body",
    status: "scheduled",
    mandatory: false,
    channels: ["in_app"],
    audiences: [{ type: "all", includeDescendants: false }],
    publishAt: "2030-11-03T06:30:00Z",
    expireAt: "2030-11-03T06:45:00",
  }
  const restored = restoreAnnouncementForm(detail, null)
  expect(buildAnnouncementPayload(restored, "publish", options())).toMatchObject({
    publishAt: "2030-11-03T06:30:00",
    expireAt: "2030-11-03T06:45:00",
  })
  restored.publishAt = restored.publishAt.slice(0, 16)
  restored.expireAt = restored.expireAt.slice(0, 16)
  expect(buildAnnouncementPayload(restored, "publish", options())).toMatchObject({
    publishAt: "2030-11-03T06:30:00",
    expireAt: "2030-11-03T06:45:00",
  })
  restored.publishAt = "2030-11-03T03:00:00"
  restored.expireAt = "2030-11-03T04:00:00"
  expect(buildAnnouncementPayload(restored, "publish", options())).toMatchObject({
    publishAt: new Date(restored.publishAt).toISOString().slice(0, 19),
    expireAt: new Date(restored.expireAt).toISOString().slice(0, 19),
  })
})

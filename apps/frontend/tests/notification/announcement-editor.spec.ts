import { describe, expect, it } from "vitest"
import {
  buildAnnouncementPayload,
  createAnnouncementState,
  templateValueRows,
  normalizeAudience,
  parseObject,
  announcementTemplateParameters,
} from "../../src/views/notification/manage/announcements/modules/announcement-editor"

const now = new Date("2026-10-09T08:00:00Z").getTime()
function state() {
  const result = createAnnouncementState()
  result.model.rawTitle = "维护通知"
  result.model.rawContent = "今晚维护"
  return result
}

describe("announcement editor payload", () => {
  it("sends a menu binding instead of the legacy route default", () => {
    const form = state()
    Object.assign(form, {
      actionEnabled: true,
      actionType: "menu",
      actionMenuId: "menu-example-detail",
      actionValues: { id: "user-17" },
      actionQuery: { tab: "profile" },
      actionTarget: null,
    })
    form.model.actionLabel = "查看用户"
    expect(buildAnnouncementPayload(form, "draft", now).action).toEqual({
      type: "menu",
      menuId: "menu-example-detail",
      params: { id: "user-17" },
      query: { tab: "profile" },
      label: "查看用户",
    })
  })

  it("sends an external link without the legacy internal route", () => {
    const form = state()
    Object.assign(form, { actionEnabled: true, actionType: "external", actionUrl: "https://example.com/help" })
    expect(buildAnnouncementPayload(form, "draft", now).action).toEqual({
      type: "external",
      url: "https://example.com/help",
      label: null,
    })
  })

  it("separates built-in bindings from manual values and restores them on edit", () => {
    const rows = templateValueRows(
      { name: { type: "string", required: true }, count: { type: "integer" }, active: { type: "boolean" } },
      { name: "stale manual text", count: 0, active: false },
      { name: { source: "recipient", field: "name" } },
    )
    expect(rows[0]!.source).toBe("name")
    expect(announcementTemplateParameters(rows)).toEqual({
      templateVariables: { count: 0, active: false },
      variableBindings: { name: { source: "recipient", field: "name" } },
    })
    rows[0]!.source = "manual"
    expect(announcementTemplateParameters(rows)).toEqual({
      templateVariables: { name: "stale manual text", count: 0, active: false },
      variableBindings: {},
    })
  })

  it("supports four built-in string fields and rejects dynamic number bindings", () => {
    const rows = templateValueRows({ value: { type: "string", required: true } })
    for (const field of ["name", "email", "roles", "department"] as const) {
      rows[0]!.source = field
      expect(announcementTemplateParameters(rows).variableBindings).toEqual({ value: { source: "recipient", field } })
    }
    rows[0]!.type = "number"
    expect(() => announcementTemplateParameters(rows)).toThrow("bindingsInvalid")
  })

  it("never substitutes template samples for the actual send values", () => {
    const rows = templateValueRows({ count: { type: "integer", required: true, example: 42 } })
    expect(rows[0]!.example).toBe("")
    const form = state()
    form.contentMode = "template"
    form.model.templateCode = "maintenance"
    form.variableRows = rows
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("variablesRequired")
    rows[0]!.example = "0"
    expect(buildAnnouncementPayload(form, "draft", now).templateVariables).toEqual({ count: 0 })
  })

  it("reloads zero and false as actual typed variables and rejects fractional integers", () => {
    const form = state()
    form.contentMode = "template"
    form.model.templateCode = "maintenance"
    form.variableRows = templateValueRows(
      { count: { type: "integer", required: true }, active: { type: "boolean" } },
      { count: 0, active: false },
    )
    expect(buildAnnouncementPayload(form, "draft", now).templateVariables).toEqual({ count: 0, active: false })
    form.variableRows[0]!.example = "1.5"
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("variablesInvalid")
  })

  it("retains a future planned time while explicitly saving only a draft", () => {
    const form = state()
    form.delivery = "scheduled"
    form.model.publishAt = "2026-10-10T01:30:00"
    const draft = buildAnnouncementPayload(form, "draft", now)
    expect(draft.saveAsDraft).toBe(true)
    expect(draft.publishAt).toBe("2026-10-10T01:30:00.000Z")
    expect(buildAnnouncementPayload(form, "publish", now).saveAsDraft).toBe(false)
    form.delivery = "now"
    expect(buildAnnouncementPayload(form, "publish", now)).toMatchObject({ publishAt: null, saveAsDraft: true })
  })

  it("validates required content, dates and object-shaped JSON before any request", () => {
    const form = state()
    form.model.rawTitle = " "
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("titleRequired")
    form.model.rawTitle = "维护"
    form.delivery = "scheduled"
    expect(() => buildAnnouncementPayload(form, "publish", now)).toThrow("publishAtRequired")
    form.model.publishAt = "2026-10-08T01:30:00"
    expect(() => buildAnnouncementPayload(form, "publish", now)).toThrow("publishAtFuture")
    form.model.publishAt = "2026-10-10T01:30:00"
    form.expires = true
    form.model.expireAt = "2026-10-09T01:30:00"
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("expireAtInvalid")
    form.expires = false
    form.actionEnabled = true
    Object.assign(form, { actionType: "legacy" })
    form.actionParams = "[]"
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("actionParamsInvalid")
    for (const text of ["null", "[]", "1", "{bad}"]) expect(() => parseObject(text)).toThrow()
    expect(parseObject('{"id":1}')).toEqual({ id: 1 })
  })

  it("only sends the active content mode and validates i18n parameters", () => {
    const form = state()
    form.contentMode = "i18n"
    form.model.i18NKey = "notification.maintenance"
    form.i18nParams = '{"count":0}'
    const payload = buildAnnouncementPayload(form, "draft", now)
    expect(payload).toMatchObject({ i18NKey: "notification.maintenance", i18NParams: { count: 0 } })
    expect(payload).not.toHaveProperty("rawTitle")
    expect(payload).not.toHaveProperty("templateCode")
    form.i18nParams = "false"
    expect(() => buildAnnouncementPayload(form, "draft", now)).toThrow("i18nParamsInvalid")
  })

  it("normalizes recipient rules, preserves department inclusion and rejects blank IDs", () => {
    expect(normalizeAudience("all", [{ type: "user", value: "" }])).toEqual([
      { type: "all", includeDescendants: false },
    ])
    expect(
      normalizeAudience("selected", [
        { type: "department", value: " dept-1 ", includeDescendants: true },
        { type: "user", value: "user-1", includeDescendants: true },
      ]),
    ).toEqual([
      { type: "department", value: "dept-1", includeDescendants: true },
      { type: "user", value: "user-1", includeDescendants: false },
    ])
    expect(() => normalizeAudience("selected", [{ type: "role", value: " " }])).toThrow("audienceRequired")
  })
})

describe("global banner payload isolation", () => {
  it("ignores inbox audience and mandatory settings for shared top banners", () => {
    const state = createAnnouncementState()
    state.displayMode = "top_banner"
    state.model.rawTitle = "title"
    state.model.rawContent = "body"
    state.model.mandatory = true
    state.audienceMode = "selected"
    state.audiences = []
    expect(buildAnnouncementPayload(state, "publish")).toMatchObject({
      displayMode: "top_banner",
      mandatory: false,
      channels: [],
      saveAsDraft: false,
      audience: [{ type: "all", includeDescendants: false }],
    })
    expect(buildAnnouncementPayload(state, "draft").saveAsDraft).toBe(true)
  })
  it("rejects per-recipient template variables in top banners", () => {
    const state = createAnnouncementState()
    state.displayMode = "top_banner"
    state.contentMode = "template"
    state.model.templateCode = "welcome"
    state.variableRows = [
      { id: 1, name: "name", type: "string", required: true, example: "", rule: {}, source: "name" },
    ]
    expect(() => buildAnnouncementPayload(state, "publish")).toThrow("bannerManualOnly")
  })
})

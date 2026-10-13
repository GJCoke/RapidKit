import { describe, expect, it } from "vitest"
import { createAnnouncementState } from "../../src/views/notification/manage/announcements/modules/announcement-editor"
import {
  buildAnnouncementAction,
  restoreAnnouncementAction,
  actionTargetTree,
} from "../../src/views/notification/manage/announcements/modules/announcement-action"

const target = {
  menuId: "menu-user",
  label: "User details",
  breadcrumb: ["Administration", "Users", "User details"],
  route: "manage_user-detail",
  path: "/manage/user/:id",
  parameters: [
    { name: "id", location: "path", required: true, defaultValue: null, descriptionKey: "userId", example: "user-1" },
    { name: "tab", location: "query", required: false, defaultValue: "profile", descriptionKey: null, example: null },
  ],
} satisfies Api.Notification.ActionTarget

function menuState() {
  const state = createAnnouncementState()
  state.actionEnabled = true
  state.actionType = "menu"
  state.actionMenuId = target.menuId
  state.actionTarget = target
  state.actionValues = { id: " user-1 " }
  state.actionQuery = {}
  return state
}

describe("announcement action bindings", () => {
  it("keeps legacy routes on their optional single-language label in local content mode", () => {
    const state = createAnnouncementState()
    state.contentMode = "local"
    restoreAnnouncementAction(state, { route: "home", params: {} })
    expect(buildAnnouncementAction(state)).toEqual({ route: "home", params: {}, label: null })
    state.model.actionLabel = "Open"
    expect(buildAnnouncementAction(state)).toEqual({ route: "home", params: {}, label: "Open" })
  })

  it.each(["menu", "external"] as const)("saves bilingual %s labels with the content default locale", (type) => {
    const state = menuState()
    state.contentMode = "local"
    state.actionType = type
    state.actionUrl = "https://example.com"
    state.actionLabels = { "zh-CN": " 查看详情 ", "en-US": " View details " }
    expect(buildAnnouncementAction(state)).toMatchObject({
      label: "查看详情",
      localizedLabel: { defaultLocale: "zh-CN", translations: { "zh-CN": "查看详情", "en-US": "View details" } },
    })
    state.localized.defaultLocale = "en-US"
    expect(buildAnnouncementAction(state)).toMatchObject({
      label: "View details",
      localizedLabel: { defaultLocale: "en-US" },
    })
  })

  it("requires the default label, omits empty optional labels, and checks Unicode character limits", () => {
    const state = menuState()
    state.contentMode = "local"
    state.actionLabels = { "zh-CN": " ", "en-US": "Open" }
    expect(() => buildAnnouncementAction(state)).toThrow("actionLabelDefaultRequired")
    state.actionLabels = { "zh-CN": "😀".repeat(64), "en-US": " " }
    expect(buildAnnouncementAction(state)?.localizedLabel?.translations).toEqual({ "zh-CN": "😀".repeat(64) })
    state.actionLabels["en-US"] = "😀".repeat(65)
    expect(() => buildAnnouncementAction(state)).toThrow("actionLabelTooLong")
  })

  it.each(["localizedLabel", "localized_label"])(
    "restores %s and retains legacy names in the default language",
    (key) => {
      const state = menuState()
      state.contentMode = "local"
      restoreAnnouncementAction(state, {
        type: "external",
        url: "https://example.com",
        label: "旧名称",
        [key]: { defaultLocale: "zh-CN", translations: { "zh-CN": "详情", "en-US": "Details" } },
      })
      expect(state.actionLabels).toEqual({ "zh-CN": "详情", "en-US": "Details" })
      restoreAnnouncementAction(state, { type: "external", url: "https://example.com", label: "旧名称" })
      expect(state.actionLabels).toEqual({ "zh-CN": "旧名称", "en-US": "" })
      restoreAnnouncementAction(state, null)
      expect(state.actionLabels).toEqual({ "zh-CN": "", "en-US": "" })
    },
  )

  it("sends menu identity and typed inputs without stale route snapshots", () => {
    const state = menuState()
    state.model.actionRoute = "outdated_route"
    state.model.actionLabel = " View user "
    expect(buildAnnouncementAction(state)).toEqual({
      type: "menu",
      menuId: "menu-user",
      params: { id: "user-1" },
      query: { tab: "profile" },
      label: "View user",
    })
    state.actionEnabled = false
    expect(buildAnnouncementAction(state)).toBeNull()
  })

  it("requires a target and its required path values before making a request", () => {
    const state = menuState()
    state.actionMenuId = null
    expect(() => buildAnnouncementAction(state)).toThrow("actionMenuRequired")
    state.actionMenuId = target.menuId
    state.actionValues.id = " "
    expect(() => buildAnnouncementAction(state)).toThrow("actionParametersRequired")
  })

  it("accepts parameterless targets when the schema omits the default descriptor list", () => {
    const state = menuState()
    state.actionTarget = { ...target, parameters: undefined }
    state.actionValues = {}
    state.actionQuery = {}
    expect(buildAnnouncementAction(state)).toEqual({
      type: "menu",
      menuId: "menu-user",
      params: {},
      query: {},
      label: null,
    })
  })

  it("rejects unknown values instead of silently discarding saved inputs", () => {
    const state = menuState()
    state.actionQuery.unknown = "existing-value"
    expect(() => buildAnnouncementAction(state)).toThrow("actionParametersUnknown")
  })

  it("preserves an existing binding for server validation while its target is unavailable", () => {
    const state = menuState()
    state.actionTarget = null
    state.actionQuery = { oldTab: "access" }
    expect(buildAnnouncementAction(state)).toMatchObject({ params: { id: "user-1" }, query: { oldTab: "access" } })
  })

  it.each([
    "javascript:alert(1)",
    "data:text/plain,hello",
    "//example.com",
    "https:example.com",
    "https://user:password@example.com",
    "https://example.com\\evil",
    "https://exa mple.com",
    "ftp://example.com",
  ])("blocks unsafe or malformed external address %s", (url) => {
    const state = createAnnouncementState()
    state.actionEnabled = true
    state.actionType = "external"
    state.actionUrl = url
    expect(() => buildAnnouncementAction(state)).toThrow("actionUrlInvalid")
  })

  it("keeps a valid external address and optional label", () => {
    const state = createAnnouncementState()
    state.actionEnabled = true
    state.actionType = "external"
    state.actionUrl = " https://example.com/details?id=1#info "
    expect(buildAnnouncementAction(state)).toEqual({
      type: "external",
      url: "https://example.com/details?id=1#info",
      label: null,
    })
  })

  it("restores both naming styles of saved menu bindings and replaces previous data", () => {
    const state = menuState()
    restoreAnnouncementAction(state, {
      type: "menu",
      menu_id: "restored",
      params: { id: 42 },
      query: { tab: "access" },
      label: "View",
      route: "old_snapshot",
    })
    expect(state).toMatchObject({
      actionEnabled: true,
      actionType: "menu",
      actionMenuId: "restored",
      actionValues: { id: "42" },
      actionQuery: { tab: "access" },
      actionTarget: null,
    })
    restoreAnnouncementAction(state, { type: "menu", menuId: "camel", params: { id: "1" } })
    expect(buildAnnouncementAction(state)).toEqual({
      type: "menu",
      menuId: "camel",
      params: { id: "1" },
      query: {},
      label: null,
    })
    restoreAnnouncementAction(state, null)
    expect(state.actionEnabled).toBe(false)
    expect(state.actionValues).toEqual({})
    expect(state.actionTarget).toBeNull()
  })

  it("preserves legacy route actions and their JSON params exactly", () => {
    const state = menuState()
    restoreAnnouncementAction(state, { route: "manage_user", params: { id: 7 }, label: "Open" })
    expect(state.actionType).toBe("legacy")
    expect(buildAnnouncementAction(state)).toEqual({ route: "manage_user", params: { id: 7 }, label: "Open" })
    state.actionParams = "[]"
    expect(() => buildAnnouncementAction(state)).toThrow("actionParamsInvalid")
    restoreAnnouncementAction(state, { type: "external", url: "https://example.com" })
    expect(state.actionType).toBe("external")
    expect(state.actionValues).toEqual({})
  })

  it("groups pages into a searchable tree with unselectable directories", () => {
    const tree = actionTargetTree([
      target,
      { ...target, menuId: "second", label: "Users", breadcrumb: ["Administration", "Users"], parameters: [] },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ label: "Administration", disabled: true })
    expect(tree[0]!.children?.[0]).toMatchObject({ label: "Users", disabled: true })
    expect(tree[0]!.children?.[0]?.children?.[0]).toMatchObject({
      key: "menu-user",
      label: "User details",
      disabled: false,
    })
    expect(tree[0]!.children?.[1]).toMatchObject({ key: "second", label: "Users", disabled: false })
  })
})

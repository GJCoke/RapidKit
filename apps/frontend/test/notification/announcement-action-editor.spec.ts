// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import AnnouncementActionEditor from "../../src/views/notification/manage/announcements/modules/announcement-action-editor.vue"
import { createAnnouncementState } from "../../src/views/notification/manage/announcements/modules/announcement-editor"

const api = vi.hoisted(() => ({ targets: vi.fn(), preview: vi.fn(), navigate: vi.fn(), permitted: true }))
vi.mock("@/service/api", () => ({
  fetchGetAnnouncementActionTargets: api.targets,
  fetchPreviewAnnouncementAction: api.preview,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => api.permitted }) }))
vi.mock("@/utils/notification/action-nav", () => ({ navigateToAction: api.navigate }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  return { $t: createI18n({ locale: "zh-CN", legacy: false, messages: { "zh-CN": { page } } }).global.t }
})
const target = {
  menuId: "user-detail",
  label: "用户详情",
  breadcrumb: ["系统管理", "用户详情"],
  route: "manage_user-detail",
  path: "/manage/user/:id",
  parameters: [
    {
      name: "id",
      location: "path",
      required: true,
      defaultValue: null,
      descriptionKey: "page.notification.announcements.actionUserIdHelp",
      example: "user-123",
    },
  ],
} satisfies Api.Notification.ActionTarget
let app: ReturnType<typeof createApp>
let host: HTMLDivElement
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia")
const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo")
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 300 })
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 })
})
afterAll(() => {
  for (const [prototype, key, descriptor] of [
    [window, "matchMedia", originalMatchMedia],
    [Element.prototype, "scrollTo", originalScrollTo],
    [HTMLElement.prototype, "offsetHeight", originalOffsetHeight],
    [HTMLElement.prototype, "clientHeight", originalClientHeight],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor)
    else Reflect.deleteProperty(prototype, key)
  }
})
beforeEach(() => {
  api.permitted = true
  api.targets.mockResolvedValue({ data: [target], error: null })
  api.preview.mockResolvedValue({ data: { type: "external", url: "https://example.com" }, error: null })
  api.navigate.mockResolvedValue(true)
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})
async function settle() {
  await nextTick()
  await nextTick()
}
async function mount(state = reactive(createAnnouncementState())) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ setup: () => () => h(AnnouncementActionEditor, { state }) })
  app.mount(host)
  await settle()
  return state
}
function button(text: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    element.textContent?.includes(text),
  )
  expect(result, `button ${text}`).toBeDefined()
  return result!
}
function externalState() {
  const state = reactive(createAnnouncementState())
  state.actionEnabled = true
  state.actionType = "external"
  state.actionUrl = "https://example.com"
  return state
}

describe("announcement action editor", () => {
  it("edits both language labels side by side and invalidates verification after either label changes", async () => {
    const state = externalState()
    state.contentMode = "local"
    state.actionLabels = { "zh-CN": "详情", "en-US": "Details" }
    await mount(state)
    const chinese = host.querySelector<HTMLInputElement>('input[aria-label="简体中文按钮名称"]')
    const english = host.querySelector<HTMLInputElement>('input[aria-label="English按钮名称"]')
    expect(chinese?.value).toBe("详情")
    expect(english?.value).toBe("Details")
    button("验证目标").click()
    await vi.waitFor(() => expect(host.textContent).toContain("目标已验证"))
    english!.value = "Read more"
    english!.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(state.actionLabels["en-US"]).toBe("Read more")
    expect(host.textContent).not.toContain("目标已验证")
    expect(button("打开页面验证").disabled).toBe(true)
  })

  it("keeps existing bilingual names when selecting a menu", async () => {
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    state.contentMode = "local"
    state.actionLabels = { "zh-CN": "阅读详情", "en-US": "Read more" }
    await mount(state)
    await vi.waitFor(() => expect(api.targets).toHaveBeenCalledOnce())
    host.querySelector<HTMLElement>('[aria-label="系统菜单"] .n-base-selection')!.click()
    await settle()
    const option = await vi.waitFor(() => {
      const result = [...document.querySelectorAll<HTMLElement>(".n-tree-node-content")].find((node) =>
        node.textContent?.includes("用户详情"),
      )
      expect(result).toBeDefined()
      return result!
    })
    option.click()
    await settle()
    expect(state.actionLabels).toEqual({ "zh-CN": "阅读详情", "en-US": "Read more" })
  })

  it("blocks action validation for a missing default label and keeps the other language intact", async () => {
    const state = externalState()
    state.contentMode = "local"
    state.actionLabels = { "zh-CN": "", "en-US": "Details" }
    await mount(state)
    button("验证目标").click()
    await settle()
    expect(host.textContent).toContain("请填写默认语言的按钮名称")
    expect(api.preview).not.toHaveBeenCalled()
    expect(state.actionLabels["en-US"]).toBe("Details")
  })

  it("loads a saved menu binding and explains path fields without JSON input", async () => {
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    state.actionType = "menu"
    state.actionMenuId = "user-detail"
    state.actionValues = { id: "saved-user" }
    await mount(state)
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLInputElement>('input[aria-label="路径参数 id"]')?.value).toBe("saved-user"),
    )
    expect(host.textContent).toContain("用户 ID")
    expect(host.textContent).toContain("user-123")
    expect(host.textContent).toContain("必填")
    expect(host.querySelector("textarea")).toBeNull()
    expect(state.actionTarget?.menuId).toBe("user-detail")
  })

  it("fills the selected page label and required fields when choosing a menu", async () => {
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    await mount(state)
    await vi.waitFor(() => expect(api.targets).toHaveBeenCalledOnce())
    host.querySelector<HTMLElement>('[aria-label="系统菜单"] .n-base-selection')!.click()
    await settle()
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLElement>(".n-tree-node-content")].some((element) =>
          element.textContent?.includes("用户详情"),
        ),
      ).toBe(true),
    )
    const option = [...document.querySelectorAll<HTMLElement>(".n-tree-node-content")].find((element) =>
      element.textContent?.includes("用户详情"),
    )!
    option.click()
    await settle()
    expect(state.actionMenuId).toBe("user-detail")
    expect(state.model.actionLabel).toBe("用户详情")
    expect(host.querySelector('input[aria-label="路径参数 id"]')).not.toBeNull()
    button("验证目标").click()
    await settle()
    expect(host.textContent).toContain("请填写必填跳转参数")
    expect(api.preview).not.toHaveBeenCalled()
  })

  it("validates an external target without opening it until explicitly requested", async () => {
    await mount(externalState())
    button("验证目标").click()
    await vi.waitFor(() => expect(host.textContent).toContain("目标已验证"))
    expect(host.textContent).toContain("https://example.com")
    expect(api.navigate).not.toHaveBeenCalled()
    button("打开页面验证").click()
    await settle()
    expect(api.navigate).toHaveBeenCalledWith({ type: "external", url: "https://example.com" }, { newWindow: true })
  })

  it("clears a verified target on edit and discards replies for previous values", async () => {
    const state = await mount(externalState())
    button("验证目标").click()
    await vi.waitFor(() => expect(host.textContent).toContain("目标已验证"))
    state.actionUrl = "https://new.example.com"
    await settle()
    expect(host.textContent).not.toContain("目标已验证")
    expect(button("打开页面验证").disabled).toBe(true)
    let resolve!: (value: unknown) => void
    api.preview.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    button("验证目标").click()
    await vi.waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2))
    state.actionUrl = "https://latest.example.com"
    await settle()
    resolve({ data: { type: "external", url: "https://old.example.com" }, error: null })
    await settle()
    expect(host.textContent).not.toContain("目标已验证")
    expect(button("打开页面验证").disabled).toBe(true)
  })

  it("explains missing permissions without fetching inaccessible targets", async () => {
    api.permitted = false
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    await mount(state)
    expect(host.textContent).toContain("没有读取菜单目标的权限")
    expect(host.textContent).toContain("没有验证跳转目标的权限")
    expect(api.targets).not.toHaveBeenCalled()
    expect(button("验证目标").disabled).toBe(true)
  })

  it("retains preview failures for retry and reports inaccessible page opens", async () => {
    api.preview.mockResolvedValueOnce({ data: null, error: { message: "failure" } })
    await mount(externalState())
    button("验证目标").click()
    await vi.waitFor(() => expect(host.textContent).toContain("跳转目标验证失败"))
    expect(button("打开页面验证").disabled).toBe(true)
    button("验证目标").click()
    await vi.waitFor(() => expect(host.textContent).toContain("目标已验证"))
    expect(host.textContent).not.toContain("跳转目标验证失败")
    api.navigate.mockResolvedValueOnce(false)
    button("打开页面验证").click()
    await vi.waitFor(() => expect(host.textContent).toContain("当前无法打开目标页面"))
  })

  it("uses a visible generic parameter explanation for unknown metadata keys", async () => {
    api.targets.mockResolvedValueOnce({
      data: [{ ...target, parameters: [{ ...target.parameters[0], descriptionKey: "internal.secret.translation" }] }],
      error: null,
    })
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    state.actionMenuId = "user-detail"
    await mount(state)
    await vi.waitFor(() => expect(host.textContent).toContain("填写页面路径中 id 对应的实际值"))
    expect(host.textContent).not.toContain("internal.secret.translation")
  })

  it("marks legacy actions clearly and allows switching to menu bindings", async () => {
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    state.actionType = "legacy"
    state.contentMode = "local"
    state.model.actionRoute = "manage_user"
    state.actionParams = '{"id":"old-user"}'
    await mount(state)
    expect(host.textContent).toContain("此公告使用旧版路由配置")
    expect(host.querySelector('input[aria-label="按钮名称"]')).not.toBeNull()
    expect(host.querySelector('input[aria-label="简体中文按钮名称"]')).toBeNull()
    expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe('{"id":"old-user"}')
    host.querySelector<HTMLInputElement>('input[type="radio"][value="menu"]')!.click()
    await settle()
    expect(state.actionType).toBe("menu")
    expect(host.querySelector("textarea")).toBeNull()
    expect(state.actionParams).toBe('{"id":"old-user"}')
  })

  it("shows directory failures and retries without changing saved values", async () => {
    api.targets.mockResolvedValueOnce({ data: null, error: { message: "failure" } })
    const state = reactive(createAnnouncementState())
    state.actionEnabled = true
    state.actionMenuId = "user-detail"
    state.actionValues = { id: "saved-user" }
    await mount(state)
    await vi.waitFor(() => expect(host.textContent).toContain("菜单目标加载失败"))
    button("重试").click()
    await vi.waitFor(() => expect(state.actionTarget?.menuId).toBe("user-detail"))
    expect(state.actionValues).toEqual({ id: "saved-user" })
    expect(host.textContent).not.toContain("菜单目标加载失败")
  })
})

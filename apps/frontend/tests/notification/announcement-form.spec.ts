// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import AnnouncementOperateDrawer from "../../src/views/notification/manage/announcements/modules/announcement-operate-drawer.vue"
import AnnouncementContentPreview from "../../src/views/notification/manage/announcements/modules/announcement-content-preview.vue"
import { useAnnouncementEditor } from "../../src/views/notification/manage/announcements/modules/use-announcement-editor"
import { useAnnouncementContentPreview } from "../../src/views/notification/manage/announcements/modules/use-announcement-content-preview"
import {
  createAnnouncementState,
  templateValueRows,
} from "../../src/views/notification/manage/announcements/modules/announcement-editor"

const api = vi.hoisted(() => ({
  checkBanner: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  detail: vi.fn(),
  preview: vi.fn(),
  previewContent: vi.fn(),
  publish: vi.fn(),
  templates: vi.fn(),
  roles: vi.fn(),
  users: vi.fn(),
  departments: vi.fn(),
  actionTargets: vi.fn(),
  actionPreview: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchCheckBanner: api.checkBanner,
  fetchCreateAnnouncement: api.create,
  fetchUpdateAnnouncement: api.update,
  fetchGetAnnouncement: api.detail,
  fetchPreviewUnsavedAudience: api.preview,
  fetchPreviewAnnouncementContent: api.previewContent,
  fetchPublishAnnouncement: api.publish,
  fetchGetNotificationTemplates: api.templates,
  fetchGetAllRoles: api.roles,
  fetchGetAllUsers: api.users,
  fetchGetDepartmentTree: api.departments,
  fetchGetAnnouncementActionTargets: api.actionTargets,
  fetchPreviewAnnouncementAction: api.actionPreview,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/utils/notification/action-nav", () => ({ navigateToAction: vi.fn(async () => true) }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  const notification = (await import("../../src/locales/langs/zh-CN/notification.json")).default
  return {
    $t: createI18n({ locale: "zh-CN", legacy: false, messages: { "zh-CN": { page, common, notification } } }).global.t,
  }
})
let app: ReturnType<typeof createApp>
let host: HTMLDivElement
const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo")
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia")
beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() })
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})
afterAll(() => {
  if (scrollToDescriptor) Object.defineProperty(Element.prototype, "scrollTo", scrollToDescriptor)
  else Reflect.deleteProperty(Element.prototype, "scrollTo")
  if (matchMediaDescriptor) Object.defineProperty(window, "matchMedia", matchMediaDescriptor)
  else Reflect.deleteProperty(window, "matchMedia")
})
beforeEach(() => {
  api.checkBanner.mockResolvedValue({
    data: { revision: 2, serverNow: new Date().toISOString(), current: null, scheduled: null },
    error: null,
  })
  api.create.mockResolvedValue({ data: { messageId: "draft-1" }, error: null })
  api.update.mockResolvedValue({ error: null })
  api.preview.mockResolvedValue({ data: { total: 3, byType: { all: 3 } }, error: null })
  api.previewContent.mockResolvedValue({
    data: {
      contentMode: "raw",
      title: "你好，张三",
      content: "研发部",
      contentParams: null,
      contentFormat: "plain_text",
    },
    error: null,
  })
  api.publish.mockResolvedValue({ error: null })
  api.templates.mockResolvedValue({ data: { records: [template()] }, error: null })
  api.roles.mockResolvedValue({ data: [], error: null })
  api.users.mockResolvedValue({ data: [], error: null })
  api.departments.mockResolvedValue({ data: [], error: null })
  api.actionTargets.mockResolvedValue({ data: [], error: null })
  api.actionPreview.mockResolvedValue({ data: null, error: { message: "invalid target" } })
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})
async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === text,
  )!
}
async function fill(label: string, value: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"],textarea[aria-label="${label}"]`,
  )!
  expect(element, label).not.toBeNull()
  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}
function template(): Api.Notification.Template {
  return {
    id: "template-1",
    code: "maintenance",
    name: "维护通知",
    category: "admin.announcement",
    level: "info",
    contentMode: "raw",
    titleTemplate: "共 {count} 项",
    contentTemplate: "启用：{active}",
    variableSchema: {
      count: { type: "integer", required: true, example: 42 },
      active: { type: "boolean", required: true, example: true },
    },
    defaultChannels: ["in_app"],
    enabled: true,
    mandatory: false,
    version: 1,
    createTime: "2026-10-09",
    updateTime: "2026-10-09",
  }
}
async function mountDrawer(messageId?: string) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(AnnouncementOperateDrawer, { visible: true, messageId }) })
  app.mount(host)
  await settle()
}
async function controller(messageId?: string, copyId?: string) {
  host = document.createElement("div")
  document.body.append(host)
  let editor!: ReturnType<typeof useAnnouncementEditor>
  const visible = ref(true)
  app = createApp({
    setup() {
      editor = useAnnouncementEditor(visible, ref(messageId), vi.fn(), ref(copyId))
      return () => null
    },
  })
  app.mount(host)
  await settle()
  editor.state.value.model.rawTitle = "维护通知"
  editor.state.value.model.rawContent = "今晚维护"
  return { editor, visible }
}

describe("approved grouped announcement drawer", () => {
  it("shows built-in selections inline, keeps samples out of actual values and allows switching to manual", async () => {
    const current = template()
    current.variableSchema = { name: { type: "string", required: true, example: "sample person" } }
    current.titleTemplate = "你好，{name}"
    current.contentTemplate = "欢迎"
    api.templates.mockResolvedValue({ data: { records: [current] }, error: null })
    api.users.mockResolvedValue({ data: [{ id: "user-1", name: "张三", username: "zhangsan" }], error: null })
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "raw",
        title: "你好，{name}",
        content: "欢迎",
        templateCode: "maintenance",
        contentParams: {},
        variableBindings: { name: { source: "recipient", field: "name" } },
        audiences: [{ type: "all" }],
        status: "draft",
        mandatory: false,
      },
    })
    await mountDrawer("existing")
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="参数 name 的取值方式"]')?.textContent).toContain("用户名称"),
    )
    expect(document.querySelector('input[aria-label="本次值 name"]')).toBeNull()
    expect(document.body.textContent).toContain("发布时按接收用户获取")
    expect(document.body.textContent).toContain("预览用户")
    button("预览内容").click()
    await settle()
    expect(document.body.textContent).toContain("请选择预览用户")
    expect(api.previewContent).not.toHaveBeenCalled()
    const source = document.querySelector<HTMLElement>('[aria-label="参数 name 的取值方式"] .n-base-selection')!
    source.click()
    await settle()
    source.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))
    await settle()
    source.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await settle()
    const input = document.querySelector<HTMLInputElement>('input[aria-label="本次值 name"]')!
    expect(input.value).toBe("")
    expect(document.body.textContent).toContain("示例参考：sample person")
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it("shows the three sections, live content preview and a collapsible preview", async () => {
    await mountDrawer()
    expect(document.querySelectorAll("section h2")).toHaveLength(3)
    expect(document.body.textContent).toContain("保存草稿不会发送，也不会启用定时发布")
    await fill("标题", "维护通知")
    await fill("正文", "请提前保存工作")
    expect(document.querySelector('[data-testid="announcement-content-preview"]')?.textContent).toContain(
      "请提前保存工作",
    )
    button("查看通知预览").click()
    await settle()
    expect(document.querySelector('[data-testid="announcement-content-preview"]')).toBeNull()
    button("查看通知预览").click()
    await settle()
    expect(document.querySelector('[data-testid="announcement-content-preview"]')).not.toBeNull()
  })

  it("previews recipients without requiring content or creating a draft", async () => {
    await mountDrawer()
    button("预览人数").click()
    await vi.waitFor(() => expect(api.preview).toHaveBeenCalledOnce())
    expect(api.preview).toHaveBeenCalledWith({ audience: [{ type: "all", includeDescendants: false }] })
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    await settle()
    expect(document.body.textContent).toContain("范围内共 3 人")
    const selected = [...document.querySelectorAll<HTMLElement>(".n-radio")].find((element) =>
      element.textContent?.includes("指定范围"),
    )!
    selected.click()
    await settle()
    expect(document.body.textContent).toContain("人数待核对")
  })

  it("blocks missing content and an unselected action menu before saving", async () => {
    await mountDrawer()
    button("存为草稿").click()
    await settle()
    expect(api.create).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("请填写公告标题")
    await fill("标题", "维护通知")
    await fill("正文", "今晚维护")
    const advanced = [...document.querySelectorAll<HTMLElement>(".n-collapse-item__header-main")].find((element) =>
      element.textContent?.includes("高级设置"),
    )!
    advanced.click()
    await settle()
    const menu = [...document.querySelectorAll<HTMLElement>(".n-radio")].find((element) =>
      element.textContent?.includes("系统菜单"),
    )!
    menu.click()
    await settle()
    button("存为草稿").click()
    await settle()
    expect(api.create).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("请选择跳转的系统菜单。")
  })
})

describe("announcement workflow", () => {
  it.each(["中", "😀"])("enforces raw text limits while editing and counts %s as one character", async (character) => {
    await mountDrawer()
    for (const [label, limit] of [
      ["标题", 256],
      ["正文", 20_000],
    ] as const) {
      const text = character.repeat(limit)
      await fill(label, text)
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
      expect(input.value).toBe(text)
      expect(input.closest(".n-input")?.querySelector(".n-input-word-count")?.textContent).toBe(`${limit} / ${limit}`)
      await fill(label, text + character)
      expect(input.value).toBe(text)
      await fill(label, "已缩短")
      expect(input.value).toBe("已缩短")
    }
  })

  it("preserves maximum-length raw input in the preview and saved draft", async () => {
    const title = "长标题-" + "测".repeat(252)
    const content = "开始标记\n" + "测".repeat(19_990) + "\n结束标记"
    await mountDrawer()
    await fill("标题", title)
    await fill("正文", content)
    const preview = document.querySelector('[data-testid="announcement-content-preview"]')!
    expect([...preview.querySelectorAll("p")].map((element) => element.textContent)).toContain(content)
    expect(preview.textContent).toContain(title)
    button("存为草稿").click()
    await settle()
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ rawTitle: title, rawContent: content, saveAsDraft: true }),
    )
    expect(api.publish).not.toHaveBeenCalled()
  })

  it("publishes maximum-length content only after confirmation and preserves the submitted text", async () => {
    const { editor } = await controller()
    const title = "长标题-" + "测".repeat(252)
    const content = "开始标记\n" + "测".repeat(19_990) + "\n结束标记"
    editor.state.value.model.rawTitle = title
    editor.state.value.model.rawContent = content
    await editor.preparePublish()
    expect(api.create).not.toHaveBeenCalled()
    expect(editor.confirming.value).toBe(true)
    expect(await editor.confirmPublish()).toBe(true)
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ rawTitle: title, rawContent: content }))
    expect(api.publish).toHaveBeenCalledWith("draft-1")
  })

  it("restores a saved menu binding and sends the binding when editing a draft", async () => {
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "raw",
        title: "维护通知",
        content: "今晚维护",
        status: "draft",
        mandatory: false,
        audiences: [{ type: "all" }],
        action: {
          type: "menu",
          menu_id: "menu-17",
          params: { id: "user-17" },
          query: { tab: "profile" },
          label: "查看用户",
        },
      },
    })
    const { editor } = await controller("existing")
    expect(editor.state.value.actionType).toBe("menu")
    expect(editor.state.value.actionMenuId).toBe("menu-17")
    expect(editor.state.value.actionValues).toEqual({ id: "user-17" })
    await editor.saveDraft()
    expect(api.update).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({
        action: {
          type: "menu",
          menuId: "menu-17",
          params: { id: "user-17" },
          query: { tab: "profile" },
          label: "查看用户",
        },
      }),
    )
  })

  it("saves a planned time as draft and reuses the created ID on further saves", async () => {
    const { editor } = await controller()
    editor.state.value.delivery = "scheduled"
    editor.state.value.model.publishAt = new Date(Date.now() + 86400000).toISOString()
    await editor.saveDraft()
    await editor.saveDraft()
    expect(api.create).toHaveBeenCalledOnce()
    expect(api.create.mock.calls[0]![0]).toMatchObject({ saveAsDraft: true })
    expect(api.create.mock.calls[0]![0].publishAt).not.toBeNull()
    expect(api.update).toHaveBeenCalledWith("draft-1", expect.objectContaining({ saveAsDraft: true }))
    expect(api.publish).not.toHaveBeenCalled()
  })

  it("only schedules after explicit confirmation and never calls immediate publish", async () => {
    const { editor, visible } = await controller()
    editor.state.value.delivery = "scheduled"
    editor.state.value.model.publishAt = new Date(Date.now() + 86400000).toISOString()
    editor.preparePublish()
    expect(api.create).not.toHaveBeenCalled()
    expect(editor.confirming.value).toBe(true)
    await editor.confirmPublish()
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ saveAsDraft: false }))
    expect(api.publish).not.toHaveBeenCalled()
    expect(visible.value).toBe(false)
  })

  it("preserves the draft on publish failure and retries with its ID", async () => {
    api.publish.mockResolvedValueOnce({ error: { message: "failed" } })
    const { editor, visible } = await controller()
    editor.preparePublish()
    expect(await editor.confirmPublish()).toBe(false)
    expect(visible.value).toBe(true)
    expect(editor.formError.value).toContain("公告已保留为草稿")
    expect(await editor.confirmPublish()).toBe(true)
    expect(api.create).toHaveBeenCalledOnce()
    expect(api.update).toHaveBeenCalledWith("draft-1", expect.anything())
    expect(api.publish).toHaveBeenCalledTimes(2)
  })

  it("drops a stale audience response after the scope changes", async () => {
    let resolve!: (result: unknown) => void
    api.preview.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { editor } = await controller()
    const request = editor.previewAudience()
    editor.state.value.audienceMode = "selected"
    await settle()
    resolve({ data: { total: 999 }, error: null })
    await request
    expect(editor.previewTotal.value).toBeNull()
    expect(api.create).not.toHaveBeenCalled()
  })

  it("loads actual template values including zero and false without filling examples", async () => {
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "raw",
        title: "共 0 项",
        content: "启用：False",
        contentFormat: "plain_text",
        templateCode: "maintenance",
        templateId: "template-1",
        contentParams: { count: 0, active: false },
        audiences: [{ type: "all" }],
        status: "draft",
        channels: ["in_app"],
        mandatory: false,
      },
    })
    const { editor } = await controller("existing")
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    expect(editor.state.value.variableRows.map((row) => row.example)).toEqual(["0", "false"])
    await editor.saveDraft()
    expect(api.update).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({ templateVariables: { count: 0, active: false } }),
    )
  })

  it("restores required and optional actual variables after a failed template lookup retry", async () => {
    const savedTemplate = template()
    savedTemplate.variableSchema.active = { type: "boolean", required: false, example: true }
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "raw",
        title: "共 0 项",
        content: "启用：False",
        contentFormat: "plain_text",
        templateCode: "maintenance",
        contentParams: { count: 0, active: false },
        audiences: [{ type: "all" }],
        status: "draft",
        mandatory: false,
      },
    })
    api.templates
      .mockResolvedValueOnce({ error: { message: "failed" } })
      .mockResolvedValue({ data: { records: [savedTemplate] }, error: null })
    const { editor } = await controller("existing")
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    expect(editor.templateError.value).not.toBe("")
    await editor.loadTemplates("maintenance")
    expect(editor.state.value.variableRows.map((row) => row.example)).toEqual(["0", "false"])
    editor.state.value.variableRows[0]!.example = "2"
    await editor.loadTemplates()
    expect(editor.state.value.variableRows[0]!.example).toBe("2")
    await editor.saveDraft()
    expect(api.update).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({ templateVariables: { count: 2, active: false } }),
    )
  })

  it("preserves offset-aware schedule and expiry instants when reopening and saving", async () => {
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "raw",
        title: "维护",
        content: "请保存工作",
        contentFormat: "plain_text",
        contentParams: {},
        audiences: [{ type: "all" }],
        status: "draft",
        mandatory: false,
        publishAt: "2099-10-10T09:30:00+08:00",
        expireAt: "2099-10-11T09:30:00+08:00",
      },
    })
    const { editor } = await controller("existing")
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    await editor.saveDraft()
    expect(api.update).toHaveBeenCalledWith(
      "existing",
      expect.objectContaining({
        publishAt: "2099-10-10T01:30:00",
        expireAt: "2099-10-11T01:30:00",
        saveAsDraft: true,
      }),
    )
  })

  it("disables editing and saving when the existing announcement fails to load", async () => {
    api.detail.mockResolvedValue({ data: null, error: { message: "failed" } })
    const { editor } = await controller("existing")
    expect(editor.disabled.value).toBe(true)
    await editor.saveDraft()
    expect(api.update).not.toHaveBeenCalled()
  })

  it("blocks duplicate submissions while a save is pending", async () => {
    let resolve!: (result: unknown) => void
    api.create.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { editor } = await controller()
    const first = editor.saveDraft()
    await editor.saveDraft()
    expect(api.create).toHaveBeenCalledOnce()
    resolve({ data: { messageId: "draft-1" }, error: null })
    await first
  })
})

async function personalizedPreview() {
  host = document.createElement("div")
  document.body.append(host)
  const state = ref(createAnnouncementState())
  state.value.contentMode = "template"
  state.value.model.templateCode = "welcome"
  state.value.variableRows = templateValueRows(
    { name: { type: "string", required: true }, count: { type: "integer" } },
    { count: 0 },
    { name: { source: "recipient", field: "name" } },
  )
  const visible = ref(true)
  let preview!: ReturnType<typeof useAnnouncementContentPreview>
  app = createApp({
    setup() {
      preview = useAnnouncementContentPreview(state, ref(template()), ref(false), visible)
      return () =>
        h(AnnouncementContentPreview, {
          state: state.value,
          template: template(),
          rendered: preview.renderedContent.value,
          stale: preview.contentStale?.value,
        })
    },
  })
  app.mount(host)
  await settle()
  return { preview, state, visible }
}

describe("built-in parameter content preview", () => {
  it("requires a recipient and never creates a notification for preview", async () => {
    const { preview } = await personalizedPreview()
    await preview.previewContent()
    expect(preview.contentError.value).toContain("请选择预览用户")
    expect(api.previewContent).not.toHaveBeenCalled()
    preview.previewUserId.value = "user-1"
    await preview.previewContent()
    expect(api.previewContent).toHaveBeenCalledWith({
      templateCode: "welcome",
      templateVariables: { count: 0 },
      variableBindings: { name: { source: "recipient", field: "name" } },
      audience: [{ type: "all", includeDescendants: false }],
      previewUserId: "user-1",
    })
    expect(preview.renderedContent.value?.title).toBe("你好，张三")
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
  })

  it("invalidates content and discards pending replies after recipient or parameter changes", async () => {
    const { preview, state } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    await preview.previewContent()
    state.value.variableRows[1]!.example = "1"
    await settle()
    expect(preview.renderedContent.value).toBeNull()
    let resolve!: (result: unknown) => void
    api.previewContent.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const request = preview.previewContent()
    preview.previewUserId.value = "user-2"
    await settle()
    resolve({ data: { title: "old user" }, error: null })
    await request
    expect(preview.renderedContent.value).toBeNull()
  })

  it("keeps the last rendered preview when audience changes and revalidates the new scope on retry", async () => {
    const { preview, state } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    await preview.previewContent()
    state.value.audienceMode = "selected"
    await settle()
    expect(preview.previewUserId.value).toBe("user-1")
    expect(host.textContent).toContain("你好，张三")
    expect(host.textContent).toContain("接收范围已调整")
    expect(preview.contentStale.value).toBe(true)
    state.value.audiences = [{ type: "role", value: "GUEST", includeDescendants: false }]
    await settle()
    expect(host.textContent).toContain("你好，张三")
    api.previewContent.mockResolvedValueOnce({ data: null, error: { response: { data: { code: 92001 } } } })
    await preview.previewContent()
    expect(api.previewContent).toHaveBeenLastCalledWith({
      templateCode: "welcome",
      templateVariables: { count: 0 },
      variableBindings: { name: { source: "recipient", field: "name" } },
      audience: [{ type: "role", value: "GUEST", includeDescendants: false }],
      previewUserId: "user-1",
    })
    expect(preview.renderedContent.value).toBeNull()
    expect(preview.contentError.value).toContain("内容预览失败")
    expect(preview.contentStale.value).toBe(false)
    await preview.previewContent()
    await settle()
    expect(host.textContent).toContain("你好，张三")
    expect(host.textContent).not.toContain("接收范围已调整")
  })

  it("discards a pending preview response after the audience changes", async () => {
    const { preview, state } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    let resolve!: (result: unknown) => void
    api.previewContent.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const request = preview.previewContent()
    state.value.audienceMode = "selected"
    await settle()
    expect(preview.contentLoading.value).toBe(false)
    resolve({ data: { title: "old audience", content: "stale" }, error: null })
    await request
    expect(preview.renderedContent.value).toBeNull()
  })

  it("keeps preview failures visible and supports retry", async () => {
    const { preview } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    api.previewContent.mockResolvedValueOnce({ error: { message: "failed" }, data: null })
    await preview.previewContent()
    expect(preview.contentError.value).toContain("内容预览失败")
    expect(preview.renderedContent.value).toBeNull()
    await preview.previewContent()
    expect(preview.contentError.value).toBe("")
    expect(preview.renderedContent.value?.title).toBe("你好，张三")
  })

  it("explains which required recipient fields are empty and ignores unrelated error data", async () => {
    const { preview } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    api.previewContent.mockResolvedValueOnce({
      data: null,
      error: {
        response: {
          data: {
            code: 92012,
            data: {
              variableErrors: [
                { name: "task_name", source: "recipient", field: "department", reason: "required_value_missing" },
                { name: "contact", source: "recipient", field: "email", reason: "required_value_missing" },
              ],
            },
          },
        },
      },
    })
    await preview.previewContent()
    expect(preview.contentError.value).toContain("task_name（用户部门）、contact（用户邮箱）")
    expect(preview.contentError.value).toContain("补全用户资料，或改为手动填写")
    expect(preview.renderedContent.value).toBeNull()
    api.previewContent.mockResolvedValueOnce({
      data: null,
      error: { response: { data: { code: 92012, data: { variableErrors: [null, { field: "password" }] } } } },
    })
    await preview.previewContent()
    expect(preview.contentError.value).toContain("内容预览失败")
    expect(preview.contentError.value).not.toContain("password")
  })

  it("discards responses when the drawer closes and permits a fresh preview after reopening", async () => {
    const { preview, visible } = await personalizedPreview()
    preview.previewUserId.value = "user-1"
    let resolve!: (result: unknown) => void
    api.previewContent.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const request = preview.previewContent()
    visible.value = false
    await settle()
    resolve({ data: { title: "stale" }, error: null })
    await request
    expect(preview.renderedContent.value).toBeNull()
    visible.value = true
    await settle()
    preview.previewUserId.value = "user-2"
    await preview.previewContent()
    expect(preview.renderedContent.value?.title).toBe("你好，张三")
  })
})

describe("localized announcement integration", () => {
  const content = {
    defaultLocale: "zh-CN",
    translations: {
      "zh-CN": { title: "维护通知", content: "{system}将进行维护" },
      "en-US": { title: "Maintenance", content: "Maintenance of {system}" },
    },
    parameters: { system: "RapidKit" },
  }
  function detail(action?: Record<string, unknown>) {
    api.detail.mockResolvedValue({
      error: null,
      data: {
        id: "existing",
        category: "admin.announcement",
        level: "info",
        contentMode: "local",
        title: "维护通知",
        content: "RapidKit将进行维护",
        contentParams: content,
        audiences: [{ type: "all" }],
        status: "draft",
        channels: ["in_app"],
        mandatory: false,
        action,
      },
    })
  }
  it.each(["zh-CN", "en-US"])("enforces title and body limits in the %s language inputs", async (locale) => {
    detail()
    await mountDrawer("existing")
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="zh-CN 标题"]')).not.toBeNull())
    if (locale === "en-US") {
      document.querySelector<HTMLElement>('[data-language-tab="en-US"]')!.click()
      await settle()
    }
    for (const [field, limit] of [
      ["标题", 256],
      ["正文", 20_000],
    ] as const) {
      const label = `${locale} ${field}`
      const text = "😀".repeat(limit)
      await fill(label, text)
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
      expect(input.value).toBe(text)
      expect(input.closest(".n-input")?.querySelector(".n-input-word-count")?.textContent).toBe(`${limit} / ${limit}`)
      await fill(label, text + "中")
      expect(input.value).toBe(text)
    }
    expect(api.update).not.toHaveBeenCalled()
  })

  it("reloads all languages and sends only localizedContent when editing a draft", async () => {
    detail()
    const { editor } = await controller("existing")
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    expect(editor.state.value.contentMode).toBe("local")
    expect(editor.state.value.localized.translations["en-US"].title).toBe("Maintenance")
    await editor.saveDraft()
    expect(api.update).toHaveBeenCalledWith("existing", expect.objectContaining({ localizedContent: content }))
    const payload = api.update.mock.calls[0]![1]
    expect(payload.rawTitle).toBeUndefined()
    expect(payload.i18NKey).toBeUndefined()
    expect(payload.templateCode).toBeUndefined()
  })
  it.each([false, true])("retains bilingual button names when loading a draft (copy=%s)", async (copying) => {
    const localizedLabel = {
      defaultLocale: "zh-CN",
      translations: { "zh-CN": "查看维护详情", "en-US": "Maintenance details" },
    }
    detail({ type: "external", url: "https://example.com", label: "查看维护详情", localized_label: localizedLabel })
    const { editor } = await controller(copying ? undefined : "existing", copying ? "existing" : undefined)
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    expect(editor.state.value.actionLabels).toEqual(localizedLabel.translations)
    await editor.saveDraft()
    const save = copying ? api.create : api.update
    const payload = save.mock.calls[0]![copying ? 0 : 1]
    expect(payload.action).toMatchObject({ type: "external", url: "https://example.com", localizedLabel })
  })
  it("allows selecting the language tabs with the keyboard", async () => {
    detail()
    await mountDrawer("existing")
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="zh-CN 标题"]')).not.toBeNull())
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs).toHaveLength(2)
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await settle()
    expect(document.querySelector('input[aria-label="en-US 标题"]')).not.toBeNull()
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toContain("en-US")
  })

  it("switches language tabs without losing edits and previews optional language fallback", async () => {
    detail()
    await mountDrawer("existing")
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="zh-CN 标题"]')).not.toBeNull())
    await fill("zh-CN 标题", "更新后的中文标题")
    const english = [...document.querySelectorAll<HTMLElement>(".n-tabs-tab")].find((el) =>
      el.textContent?.includes("en-US"),
    )!
    english.click()
    await settle()
    await fill("en-US 标题", "")
    await fill("en-US 正文", "")
    const preview = document.querySelector('[data-testid="announcement-content-preview"]')!
    expect(preview.textContent).toContain("更新后的中文标题")
    expect(preview.textContent).toContain("使用默认语言：简体中文")
    const chinese = [...document.querySelectorAll<HTMLElement>(".n-tabs-tab")].find((el) =>
      el.textContent?.includes("zh-CN"),
    )!
    chinese.click()
    await settle()
    expect((document.querySelector('input[aria-label="zh-CN 标题"]') as HTMLInputElement).value).toBe(
      "更新后的中文标题",
    )
    expect(api.update).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
  })
})

describe("top announcement confirmation", () => {
  it("checks read-only before confirmation, then saves and publishes atomically without inbox publication", async () => {
    const { editor, visible } = await controller()
    editor.state.value.displayMode = "top_banner"
    api.checkBanner.mockResolvedValue({
      data: {
        revision: 7,
        serverNow: new Date().toISOString(),
        current: { id: "old", title: "old" },
        scheduled: { id: "next" },
      },
      error: null,
    })
    await editor.preparePublish()
    expect(api.checkBanner).toHaveBeenCalledOnce()
    expect(api.create).not.toHaveBeenCalled()
    expect(editor.confirming.value).toBe(true)
    expect(editor.bannerCheck.value?.scheduled?.id).toBe("next")
    await editor.confirmPublish()
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayMode: "top_banner",
        saveAsDraft: false,
        bannerRevision: 7,
        replaceCurrent: true,
        replaceScheduled: false,
        channels: [],
        audience: [{ type: "all", includeDescendants: false }],
      }),
    )
    expect(api.publish).not.toHaveBeenCalled()
    expect(visible.value).toBe(false)
  })
  it("retains all content after a revision conflict and requires a fresh confirmation", async () => {
    const { editor, visible } = await controller()
    editor.state.value.displayMode = "top_banner"
    await editor.preparePublish()
    api.create.mockResolvedValueOnce({ data: null, error: { code: 92021 } })
    api.checkBanner.mockResolvedValue({
      data: { revision: 3, serverNow: new Date().toISOString(), current: { id: "new" } },
      error: null,
    })
    await editor.confirmPublish()
    expect(visible.value).toBe(true)
    expect(editor.state.value.model.rawContent).toBe("今晚维护")
    expect(editor.confirming.value).toBe(false)
    expect(editor.formError.value).toContain("表单已保留")
    await editor.preparePublish()
    await editor.confirmPublish()
    expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ bannerRevision: 3, replaceCurrent: true }))
  })
  it("reconfirms an existing scheduled banner and cannot save its reservation as a draft", async () => {
    api.detail.mockResolvedValue({
      data: {
        id: "plan",
        displayMode: "top_banner",
        status: "scheduled",
        contentMode: "raw",
        category: "admin.announcement",
        level: "warning",
        title: "future",
        content: "future body",
        publishAt: "2099-10-10T00:00:00Z",
        audiences: [{ type: "all" }],
        mandatory: false,
      },
      error: null,
    })
    const { editor } = await controller("plan")
    await vi.waitFor(() => expect(editor.loading.value).toBe(false))
    expect(editor.registeredBanner.value).toBe(true)
    await editor.saveDraft()
    expect(api.update).not.toHaveBeenCalled()
    api.checkBanner.mockResolvedValue({
      data: { revision: 9, serverNow: new Date().toISOString(), scheduled: { id: "plan" } },
      error: null,
    })
    await editor.preparePublish()
    await editor.confirmPublish()
    expect(api.update).toHaveBeenCalledWith(
      "plan",
      expect.objectContaining({ bannerRevision: 9, replaceScheduled: false, saveAsDraft: false }),
    )
    expect(api.publish).not.toHaveBeenCalled()
  })
})

describe("top announcement replacement and copy", () => {
  it("acknowledges replacing an overlapping current banner when scheduling a new one", async () => {
    const { editor } = await controller()
    editor.state.value.displayMode = "top_banner"
    editor.state.value.delivery = "scheduled"
    editor.state.value.model.publishAt = "2099-10-10T00:00:00"
    api.checkBanner.mockResolvedValue({
      data: {
        revision: 8,
        serverNow: new Date().toISOString(),
        current: { id: "current", expireAt: null },
        scheduled: { id: "other-plan" },
      },
      error: null,
    })
    await editor.preparePublish()
    expect(api.create).not.toHaveBeenCalled()
    await editor.confirmPublish()
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ bannerRevision: 8, replaceCurrent: true, replaceScheduled: true, saveAsDraft: false }),
    )
  })
  it.each(["inbox", "top_banner"] as const)(
    "copies historical %s content into an unsaved announcement and resets old validity",
    async (displayMode) => {
      api.detail.mockResolvedValue({
        data: {
          id: "old",
          displayMode,
          status: "superseded",
          contentMode: "raw",
          category: "admin.announcement",
          level: "error",
          title: "History",
          content: "Old body",
          publishAt: "2026-01-01T00:00:00Z",
          expireAt: "2026-01-02T00:00:00Z",
          audiences: displayMode === "inbox" ? [{ type: "all" }] : [],
          mandatory: displayMode === "inbox",
        },
        error: null,
      })
      const { editor } = await controller(undefined, "old")
      await vi.waitFor(() => expect(editor.loading.value).toBe(false))
      expect(editor.savedStatus.value).toBe("unsaved")
      expect(editor.state.value.displayMode).toBe(displayMode)
      expect(editor.state.value.model.mandatory).toBe(displayMode === "inbox")
      if (displayMode === "inbox") expect(editor.state.value.audienceMode).toBe("all")
      expect(editor.state.value.model.level).toBe("error")
      expect(editor.state.value.model.publishAt).toBeNull()
      expect(editor.state.value.model.expireAt).toBeNull()
      expect(editor.state.value.delivery).toBe("now")
      await editor.preparePublish()
      await editor.confirmPublish()
      expect(api.create).toHaveBeenCalledOnce()
      expect(api.update).not.toHaveBeenCalled()
    },
  )
})

describe("banner create retry identity", () => {
  it("retains the same nonce for a failed identical publication and rotates it after content changes", async () => {
    const { editor } = await controller()
    editor.state.value.displayMode = "top_banner"
    api.create.mockResolvedValue({ data: null, error: { message: "response lost" } })
    await editor.preparePublish()
    await editor.confirmPublish()
    const original = api.create.mock.calls[0]![0].clientRequestId
    expect(original).toMatch(/^[a-f0-9-]{36}$/)
    await editor.preparePublish()
    await editor.confirmPublish()
    expect(api.create.mock.calls[1]![0].clientRequestId).toBe(original)
    editor.state.value.model.rawContent = "changed publication intent"
    await editor.preparePublish()
    await editor.confirmPublish()
    expect(api.create.mock.calls[2]![0].clientRequestId).not.toBe(original)
  })
})

it("publishes on HTTP browsers where crypto.randomUUID is unavailable", async () => {
  const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID")
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined })
  try {
    const { editor } = await controller()
    editor.state.value.displayMode = "top_banner"
    await editor.preparePublish()
    await editor.confirmPublish()
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
      }),
    )
  } finally {
    if (original) Object.defineProperty(crypto, "randomUUID", original)
    else Reflect.deleteProperty(crypto, "randomUUID")
  }
})

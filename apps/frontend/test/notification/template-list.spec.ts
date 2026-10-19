// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { NConfigProvider } from "naive-ui"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import TemplateList from "../../src/views/notification/manage/templates/index.vue"
import TemplateSearch from "../../src/views/notification/manage/templates/modules/template-search.vue"
import TemplateDetailPanel from "../../src/views/notification/manage/templates/modules/template-detail-panel.vue"

const { listTemplates, deleteTemplate, allowed } = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  deleteTemplate: vi.fn(),
  allowed: { update: true, delete: true },
}))
vi.mock("@/service/api", () => ({
  fetchGetNotificationTemplates: listTemplates,
  fetchDeleteNotificationTemplate: deleteTemplate,
  fetchCreateNotificationTemplate: vi.fn(),
  fetchUpdateNotificationTemplate: vi.fn(),
}))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => ({
    hasAuth: (permission: string) =>
      permission.endsWith(":update") ? allowed.update : permission.endsWith(":delete") ? allowed.delete : true,
  }),
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  const notification = (await import("../../src/locales/langs/zh-CN/notification.json")).default
  const datatable = (await import("../../src/locales/langs/zh-CN/datatable.json")).default
  const form = (await import("../../src/locales/langs/zh-CN/form.json")).default
  return {
    $t: createI18n({
      locale: "zh-CN",
      legacy: false,
      messages: { "zh-CN": { page, common, notification, datatable, form } },
    }).global.t,
  }
})

let app: ReturnType<typeof createApp>
let host: HTMLDivElement
const first: Api.Notification.Template = {
  id: "task",
  code: "task.completed.notice",
  name: "任务完成通知",
  category: "task.completed",
  level: "info",
  contentMode: "raw",
  titleTemplate: "{task_name} 已完成",
  contentTemplate: "你好，{username}",
  contentFormat: "plain_text",
  variableSchema: { task_name: { type: "string", required: true, description: "任务名称" } },
  defaultChannels: ["in_app"],
  enabled: true,
  mandatory: false,
  version: 1,
  createTime: "2026-10-09 10:00:00",
  updateTime: "2026-10-09 10:30:00",
}
const second: Api.Notification.Template = {
  ...first,
  id: "security",
  code: "security.alert",
  name: "系统安全提醒",
  category: "system.security",
  contentMode: "i18n",
  titleTemplate: "notification.security.title",
  contentTemplate: "notification.security.body",
  enabled: false,
  mandatory: false,
  variableSchema: {},
}
function response(records = [first, second]) {
  return { data: { records, page: 1, pageSize: 10, total: records.length }, error: null }
}
async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === text || element.getAttribute("aria-label") === text,
  )!
}
function details() {
  return document.querySelector<HTMLElement>('[aria-label="模板详情"]')
}
async function mountList() {
  app = createApp({ render: () => h(NConfigProvider, {}, { default: () => h(TemplateList) }) })
  app.mount(host)
  await vi.waitFor(() => expect(host.textContent).toContain(first.name))
  await settle()
}
beforeEach(() => {
  allowed.update = true
  allowed.delete = true
  listTemplates.mockReset().mockResolvedValue(response())
  deleteTemplate.mockReset().mockResolvedValue({ error: null })
  host = document.createElement("div")
  document.body.append(host)
})
afterEach(() => {
  app?.unmount()
  host.remove()
  vi.clearAllMocks()
})

describe("template search", () => {
  it("starts expanded, toggles like task records, submits with Enter, and clears filters on reset", async () => {
    const model = reactive<Api.Notification.TemplateListQuery>({ page: 2, pageSize: 10 })
    const search = vi.fn()
    app = createApp({ render: () => h(TemplateSearch, { model, onSearch: search }) })
    app.mount(host)
    await settle()
    const field = host.querySelector<HTMLInputElement>("input")!
    expect(field).not.toBeNull()
    const collapse = host.querySelector(".n-collapse-item")!
    expect(collapse).not.toBeNull()
    expect(collapse.classList.contains("n-collapse-item--active")).toBe(true)
    expect(host.textContent).not.toContain("收起")
    model.keyword = "security"
    model.enabled = false
    await settle()
    const header = host.querySelector<HTMLElement>(".n-collapse-item__header-main")!
    header.click()
    await settle()
    expect(collapse.classList.contains("n-collapse-item--active")).toBe(false)
    header.click()
    await settle()
    expect(collapse.classList.contains("n-collapse-item--active")).toBe(true)
    expect(model.keyword).toBe("security")
    expect(model.enabled).toBe(false)
    expect(search).not.toHaveBeenCalled()
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
    expect(search).toHaveBeenCalledOnce()
    button("重置").click()
    await settle()
    expect(model.keyword).toBeUndefined()
    expect(model.enabled).toBeUndefined()
    expect(search).toHaveBeenCalledTimes(2)
  })
})

describe("template list and detail selection", () => {
  it("selects the first template, supports keyboard switching and preserves raw text and reserved rules", async () => {
    await mountList()
    expect(details()?.textContent).toContain(first.titleTemplate)
    expect(details()?.textContent).toContain("示例值")
    const row = [...host.querySelectorAll("tbody tr")].find((element) => element.textContent?.includes(second.code))!
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await settle()
    expect(row.getAttribute("aria-selected")).toBe("true")
    expect(details()?.textContent).toContain(second.titleTemplate)
    expect(details()?.textContent).toContain("系统保留分类，用户不可退订")
    expect(details()?.textContent).not.toContain("尊重分类订阅设置")
  })

  it("keeps selection on refresh with updated content and clears details on an empty result", async () => {
    await mountList()
    const row = [...host.querySelectorAll("tbody tr")].find((element) => element.textContent?.includes(second.code))!
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await settle()
    listTemplates.mockResolvedValueOnce(response([first, { ...second, titleTemplate: "security.updated.title" }]))
    button("刷新").click()
    await vi.waitFor(() => expect(details()?.textContent).toContain("security.updated.title"))
    listTemplates.mockResolvedValueOnce(response([first]))
    button("刷新").click()
    await vi.waitFor(() => expect(details()?.textContent).toContain(first.titleTemplate))
    listTemplates.mockResolvedValueOnce(response([]))
    button("刷新").click()
    await vi.waitFor(() => expect(details()?.textContent).toContain("暂无可查看的模板"))
    expect(details()?.textContent).not.toContain(first.code)
  })

  it("requires confirmation before deleting and removes actions without their permissions", async () => {
    await mountList()
    button("更多操作").click()
    await settle()
    const option = await vi.waitFor(() => {
      const item = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option")].find((element) =>
        element.textContent?.includes("删除"),
      )
      expect(item).not.toBeUndefined()
      return item!
    })
    option.querySelector<HTMLElement>(".n-dropdown-option-body")!.click()
    await settle()
    expect(document.body.textContent).toContain("确定删除模板")
    expect(deleteTemplate).not.toHaveBeenCalled()
    button("取消").click()
    await settle()
    app.unmount()
    allowed.update = false
    allowed.delete = false
    await mountList()
    expect(
      [...details()!.querySelectorAll("button")].some((element) => element.textContent?.trim() === "编辑模板"),
    ).toBe(false)
    expect(details()?.querySelector('[aria-label="更多操作"]')).toBeNull()
  })

  it("prevents duplicate deletion, keeps a failed confirmation open and refreshes after a successful retry", async () => {
    await mountList()
    button("更多操作").click()
    await settle()
    document.querySelector<HTMLElement>(".n-dropdown-option-body")!.click()
    await settle()
    let finish!: (result: { error: object }) => void
    deleteTemplate.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const confirm = document.querySelector<HTMLButtonElement>(".n-dialog .n-button--error-type")!
    confirm.click()
    confirm.click()
    await settle()
    expect(deleteTemplate).toHaveBeenCalledTimes(1)
    expect(deleteTemplate).toHaveBeenCalledWith(first.id)
    expect(confirm.disabled).toBe(true)
    finish({ error: { message: "Cannot delete" } })
    await vi.waitFor(() => expect(confirm.disabled).toBe(false))
    expect(document.querySelector(".n-dialog")?.textContent).toContain("确定删除模板")
    listTemplates.mockResolvedValueOnce(response([second]))
    confirm.click()
    await vi.waitFor(() => expect(deleteTemplate).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(details()?.textContent).toContain(second.titleTemplate))
    expect(details()?.textContent).not.toContain(first.code)
  })
})

describe("template detail preview", () => {
  async function mountPanel(template: Api.Notification.Template) {
    const state = reactive({ template })
    app = createApp({
      render: () =>
        h(
          NConfigProvider,
          {},
          {
            default: () =>
              h(TemplateDetailPanel, {
                template: state.template,
                canEdit: false,
                canDelete: false,
                deleting: false,
              }),
          },
        ),
    })
    app.mount(host)
    await settle()
    return state
  }
  function preview() {
    return host.querySelector<HTMLElement>('[aria-label="通知预览"]')!
  }

  it("displays stored examples as read-only text and previews safely without mutating data", async () => {
    const template = {
      ...first,
      variableSchema: {
        task_name: { type: "string", required: true, example: "导出报表" },
        username: { type: "string", required: true, example: "<img src=x onerror=alert(1)>" },
      },
    }
    const original = JSON.stringify(template)
    await mountPanel(template)
    expect(details()?.querySelector("input")).toBeNull()
    expect(details()?.textContent).toContain("导出报表")
    expect(preview().textContent).toContain("导出报表 已完成")
    expect(preview().textContent).toContain("你好，<img src=x onerror=alert(1)>")
    expect(preview().querySelector("img")).toBeNull()
    expect(JSON.stringify(template)).toBe(original)
    expect(listTemplates).not.toHaveBeenCalled()
    expect(deleteTemplate).not.toHaveBeenCalled()
  })

  it("preserves zero/false examples, reports undeclared variables and updates on selection", async () => {
    const state = await mountPanel({
      ...first,
      titleTemplate: "{count}/{flag}",
      contentTemplate: "{unknown}",
      variableSchema: {
        count: { type: "integer", required: true, example: 0 },
        flag: { type: "boolean", required: true, examples: [false] },
      },
    })
    expect(preview().textContent).toContain("0/False")
    expect(host.textContent).toContain("以下变量尚未定义：unknown")
    state.template = {
      ...first,
      id: "different",
      variableSchema: { task_name: { type: "string", example: "另一任务" } },
    }
    await settle()
    expect(details()?.textContent).not.toContain("count")
    expect(preview().textContent).toContain("另一任务 已完成")
  })

  it("shows missing historical samples as unset and does not invent preview values", async () => {
    await mountPanel({
      ...first,
      variableSchema: { task_name: { type: "string", required: true }, username: { type: "string" } },
    })
    expect(details()?.querySelector("input")).toBeNull()
    expect(details()?.textContent).toContain("未设置")
    expect(preview().textContent).toContain("{task_name} 已完成")
    expect(preview().textContent).not.toContain("示例任务")
    expect(host.textContent).toContain("以下变量未填写示例值：task_name、username")
  })

  it("groups repeated preview warnings and shows parameter metadata in separate cells on one row", async () => {
    await mountPanel({
      ...first,
      titleTemplate: "{hha}/{cc}",
      contentTemplate: "{hha}/{cc}/{date}/{jj}",
      variableSchema: {
        hha: { type: "number", required: true },
        cc: { type: "string", required: true },
        date: { type: "string" },
        jj: { type: "string" },
      },
    })
    const warnings = preview().querySelectorAll("li")
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.textContent).toBe("以下变量未填写示例值：hha、cc、date、jj。")
    const cells = details()!.querySelectorAll("tbody tr")[0]!.querySelectorAll("td")
    expect([...cells].map((cell) => cell.textContent?.trim())).toEqual(["hha", "数值", "必填", "未设置"])
  })

  it("groups each warning kind separately without losing affected variables", async () => {
    await mountPanel({
      ...first,
      titleTemplate: "{missing}/{bad}/{unknown}",
      contentTemplate: "{missing}/{bad}/{other}",
      variableSchema: {
        missing: { type: "string" },
        bad: { type: "integer", example: "1.5" },
      },
    })
    expect(preview().querySelectorAll("li")).toHaveLength(3)
    expect(preview().textContent).toContain("以下变量未填写示例值：missing")
    expect(preview().textContent).toContain("以下变量的示例值与类型不符：bad")
    expect(preview().textContent).toContain("以下变量尚未定义：unknown、other")
  })

  it("translates i18n templates with samples and explains missing translation keys", async () => {
    const state = await mountPanel({
      ...second,
      titleTemplate: "page.notification.manage.templates.list.updatedAt",
      contentTemplate: "notification.category.taskCompleted",
      variableSchema: { time: { type: "string", example: "10:30" } },
    })
    expect(preview().textContent).toContain("更新于 10:30")
    expect(preview().textContent).toContain("任务完成")
    state.template = second
    await settle()
    expect(preview().textContent).toContain(second.titleTemplate)
    expect(host.textContent).toContain(`当前语言未找到翻译：${second.titleTemplate}、${second.contentTemplate}`)
  })
})

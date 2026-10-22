// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import TemplateOperateDrawer from "../../src/views/notification/manage/templates/modules/template-operate-drawer.vue"

const { createTemplate, updateTemplate } = vi.hoisted(() => ({
  createTemplate: vi.fn().mockResolvedValue({ error: null }),
  updateTemplate: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock("@/service/api", () => ({
  fetchCreateNotificationTemplate: createTemplate,
  fetchUpdateNotificationTemplate: updateTemplate,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  const notification = (await import("../../src/locales/langs/zh-CN/notification.json")).default
  const form = (await import("../../src/locales/langs/zh-CN/form.json")).default
  return {
    $t: createI18n({ locale: "zh-CN", legacy: false, messages: { "zh-CN": { page, common, notification, form } } })
      .global.t,
  }
})

let app: ReturnType<typeof createApp>
let host: HTMLDivElement
const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo")
beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() })
})
afterAll(() => {
  if (scrollToDescriptor) Object.defineProperty(Element.prototype, "scrollTo", scrollToDescriptor)
  else Reflect.deleteProperty(Element.prototype, "scrollTo")
})
async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function input(label: string) {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"], textarea[aria-label="${label}"]`,
  )!
}
async function fill(label: string, value: string) {
  const element = input(label)
  expect(element, label).not.toBeNull()
  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === text,
  )!
}
async function mount(rowData?: Api.Notification.Template) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({
    render: () => h(TemplateOperateDrawer, { visible: true, operateType: rowData ? "edit" : "add", rowData }),
  })
  app.mount(host)
  await settle()
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})

function template(): Api.Notification.Template {
  return {
    id: "existing-template",
    code: "task.completed.notice",
    name: "任务完成通知",
    category: "task.completed",
    level: "success",
    contentMode: "raw",
    titleTemplate: "{username} 完成任务",
    contentTemplate: "任务已完成",
    contentFormat: "markdown",
    variableSchema: { username: { type: "string", required: true, description: "Name" } },
    defaultChannels: ["in_app"],
    enabled: true,
    mandatory: false,
    version: 1,
    createTime: "2026-10-09",
    updateTime: "2026-10-09",
  }
}

describe("template configuration form", () => {
  it("summarizes missing samples once across title and body in the editor preview", async () => {
    const row = template()
    row.titleTemplate = "{username}/{task_name}"
    row.contentTemplate = "{username}/{task_name}"
    row.variableSchema.task_name = { type: "string", required: true }
    await mount(row)
    const preview = document.querySelector('[aria-labelledby="template-preview-heading"]')!
    expect(preview.querySelectorAll("li")).toHaveLength(1)
    expect(preview.textContent).toContain("以下变量未填写示例值：username、task_name。")
  })

  it("updates variable previews and blocks invalid JSON instead of discarding it", async () => {
    await mount(template())
    await fill("标题模板", "你好，{username}")
    await fill("示例值 1", "张三")
    expect(document.querySelector('[aria-labelledby="template-preview-heading"]')?.textContent).toContain("你好，张三")
    button("JSON 编辑").click()
    await settle()
    const json = input("JSON 编辑")
    json.value = "{"
    json.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(button("表格编辑").disabled).toBe(true)
    expect(document.body.textContent).toContain("请检查变量配置")
    button("保存修改").click()
    await settle()
    expect(updateTemplate).not.toHaveBeenCalled()
  })

  it("loads and saves examples while preserving noneditable fields", async () => {
    const row = template()
    row.variableSchema.username!.example = "李四"
    await mount(row)
    expect(input("示例值 1").value).toBe("李四")
    await fill("示例值 1", "张三")
    expect(input("模板编码").disabled).toBe(true)
    button("保存修改").click()
    await vi.waitFor(() => expect(updateTemplate).toHaveBeenCalledOnce())
    expect(updateTemplate).toHaveBeenCalledWith(
      "existing-template",
      expect.objectContaining({
        contentFormat: "markdown",
        defaultChannels: ["in_app"],
        variableSchema: { username: { type: "string", required: true, description: "Name", example: "张三" } },
      }),
    )
    expect(updateTemplate.mock.calls[0]![1]).not.toHaveProperty("code")
    expect(updateTemplate.mock.calls[0]![1]).not.toHaveProperty("contentMode")
  })

  it("creates a raw template with a selected category and persisted examples", async () => {
    await mount()
    await fill("模板名称", "任务完成通知")
    await fill("模板编码", "task.completed.notice")
    await fill("标题模板", "任务完成")
    await fill("正文模板", "任务已执行完成")
    document.querySelector<HTMLElement>('[aria-label="通知分类"] .n-base-selection')!.click()
    await settle()
    const option = await vi.waitFor(() => {
      const option = [...document.querySelectorAll<HTMLElement>(".n-base-select-option")].find((element) =>
        element.textContent?.includes("admin.announcement"),
      )
      expect(option).not.toBeUndefined()
      return option!
    })
    option.click()
    await settle()
    button("添加变量").click()
    await settle()
    await fill("变量名 1", "username")
    await fill("示例值 1", "张三")
    button("创建模板").click()
    await vi.waitFor(() => expect(createTemplate).toHaveBeenCalledOnce())
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "admin.announcement",
        contentMode: "raw",
        variableSchema: { username: { required: true, example: "张三" } },
      }),
    )
  })

  it("saves JSON changes to examples and returns them to table editing", async () => {
    await mount(template())
    await fill("示例值 1", "旧值")
    button("JSON 编辑").click()
    await settle()
    expect(input("JSON 编辑").value).toContain('"example": "旧值"')
    await fill("JSON 编辑", JSON.stringify({ username: { type: "string", required: true, example: "新值" } }))
    button("表格编辑").click()
    await settle()
    expect(input("示例值 1").value).toBe("新值")
    button("保存修改").click()
    await vi.waitFor(() => expect(updateTemplate).toHaveBeenCalledOnce())
    expect(updateTemplate.mock.calls[0]![1].variableSchema.username.example).toBe("新值")
  })

  it("blocks a mismatched example before saving and allows clearing it", async () => {
    const row = template()
    row.variableSchema = { username: { type: "integer", required: true, example: 0 } }
    await mount(row)
    await fill("示例值 1", "1.5")
    button("保存修改").click()
    await settle()
    expect(updateTemplate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("示例值须与所选类型一致")
    await fill("示例值 1", "")
    button("保存修改").click()
    await vi.waitFor(() => expect(updateTemplate).toHaveBeenCalledOnce())
    expect(updateTemplate.mock.calls[0]![1].variableSchema.username.example).toBe("")
  })
})

// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import AnnouncementSearch from "@/views/notification/manage/announcements/modules/announcement-search.vue"
import AnnouncementTableActions from "@/views/notification/manage/announcements/modules/announcement-table-actions.vue"
import AnnouncementTableCell from "@/views/notification/manage/announcements/modules/announcement-table-cell.vue"
import AnnouncementList from "@/views/notification/manage/announcements/index.vue"
import {
  announcementActions,
  announcementPermissions as permissions,
  announcementStatus,
} from "@/views/notification/manage/announcements/modules/announcement-table"

const currentAccess = reactive({ allowed: true })

vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => {
    const hasAuth = () => currentAccess.allowed
    return {
      hasAuth,
      getActionContext: (locale = "zh-CN") => ({
        ready: true,
        hasAuth,
        actorId: "actor",
        isAdmin: false,
        impersonating: false,
        locale,
      }),
    }
  },
}))
const api = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  recall: vi.fn(),
  check: vi.fn(),
  refresh: vi.fn(),
  warning: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchGetAnnouncements: api.list,
  fetchDeleteAnnouncement: api.remove,
  fetchCancelAnnouncement: api.cancel,
  fetchRecallAnnouncement: api.recall,
  fetchCheckBanner: api.check,
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/store/modules/banner", () => ({ useBannerStore: () => ({ snapshot: null, refresh: api.refresh }) }))
vi.mock("@/views/notification/manage/announcements/modules/announcement-operate-drawer.vue", () => ({
  default: { render: () => null },
}))
vi.mock("@/views/notification/manage/announcements/modules/announcement-detail.vue", () => ({
  default: { render: () => null },
}))
vi.mock("@/locales", async () => {
  const { createI18n } = await import("vue-i18n")
  const page = (await import("../../src/locales/langs/zh-CN/page.json")).default
  const common = (await import("../../src/locales/langs/zh-CN/common.json")).default
  const notification = (await import("../../src/locales/langs/zh-CN/notification.json")).default
  return {
    $t: createI18n({ locale: "zh-CN", legacy: false, messages: { "zh-CN": { page, common, notification } } }).global.t,
    getLocale: () => "zh-CN",
  }
})

function row(
  status: Api.Notification.AnnouncementItem["status"] = "draft",
  displayMode: Api.Notification.AnnouncementItem["displayMode"] = "inbox",
): Api.Notification.AnnouncementItem {
  return {
    id: "notice",
    title: "标题{username}",
    content: "第一行\n第二行 <img src=x>",
    category: "admin.announcement",
    level: "info",
    contentMode: "raw",
    status,
    displayMode,
    source: "admin",
    mandatory: false,
    createTime: "2026-10-10T00:00:00Z",
    updateTime: "2026-10-10T00:00:00Z",
  }
}
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
async function mount(render: () => ReturnType<typeof h>) {
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render })
  app.mount(host)
  await settle()
}
async function settle() {
  await nextTick()
  await nextTick()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  currentAccess.allowed = true
})

describe("announcement permissions and lifecycle actions", () => {
  it("keeps details outside and requires both editing and publishing permission for draft publication", () => {
    const allowed = new Set<string>([permissions.publish, permissions.cancel])
    const auth = (key: string) => allowed.has(key)
    expect(announcementActions(row(), auth)).toEqual({ primary: "detail", more: ["cancel"] })
    allowed.add(permissions.update)
    expect(announcementActions(row(), auth)).toEqual({ primary: "detail", more: ["edit", "publish", "cancel"] })
    allowed.delete(permissions.publish)
    expect(announcementActions(row(), auth).more).not.toContain("publish")
  })
  it.each(["expired", "recalled", "superseded", "cancelled"] as const)(
    "offers copying ended announcements with create permission (%s)",
    (status) => {
      expect(announcementActions(row(status, "top_banner"), () => true)).toEqual({ primary: "detail", more: ["copy"] })
      expect(announcementActions(row(status, "top_banner"), () => false)).toEqual({ primary: "detail", more: [] })
      expect(announcementActions(row(status), () => true)).toEqual({ primary: "detail", more: ["copy"] })
    },
  )
  it.each(["inbox", "top_banner"] as const)("allows copying every status of %s only with create permission", (mode) => {
    for (const status of [
      "draft",
      "scheduled",
      "publishing",
      "published",
      "expired",
      "recalled",
      "superseded",
      "cancelled",
    ] as const) {
      const allowed = announcementActions(row(status, mode), () => true)
      expect(allowed.primary, status).toBe("detail")
      expect(allowed.more, status).not.toContain("detail")
      expect([allowed.primary, ...allowed.more], status).toContain("copy")
      const denied = announcementActions(row(status, mode), (permission) => permission !== permissions.create)
      expect([denied.primary, ...denied.more], status).not.toContain("copy")
    }
  })
  it("prevents edits/deletion after publication and prevents early recall while publishing", () => {
    expect(announcementActions(row("scheduled"), () => true)).toEqual({
      primary: "detail",
      more: ["edit", "copy", "cancel", "delete"],
    })
    expect(announcementActions(row("published"), () => true)).toEqual({ primary: "detail", more: ["copy", "recall"] })
    expect(announcementActions(row("published"), () => false)).toEqual({ primary: "detail", more: [] })
    expect(announcementActions(row("publishing"), () => true)).toEqual({ primary: "detail", more: ["copy"] })
  })
  it("distinguishes banner state from inbox delivery and keeps ended states neutral", () => {
    expect(announcementStatus(row("published", "top_banner")).label).toBe("展示中")
    expect(announcementStatus(row("published")).label).toBe("已发布")
    expect(announcementStatus(row("scheduled", "top_banner")).label).toBe("待生效")
    expect(announcementStatus(row("recalled", "top_banner")).label).toBe("已下架")
    expect(announcementStatus(row("recalled")).label).toBe("已撤回")
    expect(announcementStatus(row("cancelled")).type).toBe("default")
  })
})

describe("announcement table interactions", () => {
  it("does not describe a cancelled schedule as already published", async () => {
    const announcement = { ...row("cancelled"), publishAt: "2026-10-11T00:00:00Z" }
    await mount(() => h(AnnouncementTableCell, { row: announcement, kind: "time" }))
    expect(host.textContent).toContain("计划")
    expect(host.textContent).not.toContain("发布")
    expect(host.textContent).toContain("不限时间")
  })
  it("keeps full raw text safe and opens details from the title", async () => {
    const detail = vi.fn()
    await mount(() => h(AnnouncementTableCell, { row: row(), kind: "content", onDetail: detail }))
    expect(host.textContent).toContain("标题{username}")
    expect(host.textContent).toContain("系统公告")
    expect(host.textContent).toContain("第一行 第二行 <img src=x>")
    expect(host.querySelector("img")).toBeNull()
    host.querySelector("button")!.click()
    expect(detail).toHaveBeenCalledOnce()
  })
  it("disables both the primary and dropdown actions during a request", async () => {
    const action = vi.fn()
    const state = reactive({ busy: false })
    await mount(() => h(AnnouncementTableActions, { row: row(), busy: state.busy, onAction: action }))
    host.querySelector("button")!.click()
    expect(action).toHaveBeenCalledWith("detail")
    state.busy = true
    await settle()
    for (const button of host.querySelectorAll("button")) {
      expect(button.disabled).toBe(true)
      button.click()
    }
    expect(action).toHaveBeenCalledOnce()
  })
  it.each(["inbox", "top_banner"] as const)(
    "keeps a single copy action inside the icon-free more menu (%s)",
    async (mode) => {
      const action = vi.fn()
      const state = reactive({ busy: false })
      await mount(() => h(AnnouncementTableActions, { row: row("recalled", mode), busy: state.busy, onAction: action }))
      expect([...host.querySelectorAll("button")].map((button) => button.textContent?.trim())).toEqual(["详情", "更多"])
      const more = host.querySelector<HTMLButtonElement>('[aria-label="更多"]')
      expect(more).not.toBeNull()
      expect(more!.querySelector(".n-button__icon")).toBeNull()
      host.querySelector<HTMLButtonElement>("button")!.click()
      expect(action).toHaveBeenCalledWith("detail")
      more!.click()
      await vi.waitFor(() => expect(document.querySelector(".n-dropdown-menu")).not.toBeNull())
      const copy = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
        item.textContent?.includes("复制"),
      )!
      expect(copy.querySelector('.n-dropdown-option-body__prefix [aria-hidden="true"]')).not.toBeNull()
      expect(copy.querySelector(".text-info")).not.toBeNull()
      copy.click()
      expect(action).toHaveBeenLastCalledWith("copy")
      state.busy = true
      await settle()
      more!.click()
      expect(action).toHaveBeenCalledTimes(2)
      expect(more!.disabled).toBe(true)
    },
  )
  it.each(["inbox", "top_banner"] as const)("emits copy from a published %s announcement menu", async (mode) => {
    const action = vi.fn()
    await mount(() => h(AnnouncementTableActions, { row: row("published", mode), busy: false, onAction: action }))
    host.querySelector<HTMLButtonElement>('[aria-label="更多"]')!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-dropdown-menu")).not.toBeNull())
    const menuText = document.querySelector(".n-dropdown-menu")!.textContent
    expect(menuText).toContain(mode === "top_banner" ? "下架公告" : "撤回通知")
    expect(menuText).not.toContain("详情")
    const recall = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
      item.textContent?.includes(mode === "top_banner" ? "下架公告" : "撤回通知"),
    )!
    expect(recall.querySelector('.n-dropdown-option-body__prefix [aria-hidden="true"]')).not.toBeNull()
    expect(recall.querySelector(".text-warning")).not.toBeNull()
    const copy = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
      item.textContent?.includes("复制"),
    )
    expect(copy).toBeDefined()
    copy!.click()
    expect(action).toHaveBeenCalledWith("copy")
  })
  it("distinguishes draft operations with matching icons and semantic colors", async () => {
    await mount(() => h(AnnouncementTableActions, { row: row(), busy: false }))
    host.querySelector<HTMLButtonElement>('[aria-label="更多"]')!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-dropdown-menu")).not.toBeNull())
    for (const [label, color] of [
      ["编辑", "text-primary"],
      ["复制", "text-info"],
      ["发布", "text-success"],
      ["取消", "text-warning"],
      ["删除", "text-error"],
    ]) {
      const option = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
        item.textContent?.includes(label!),
      )!
      expect(option, label).toBeDefined()
      expect(option.querySelector('.n-dropdown-option-body__prefix [aria-hidden="true"]'), label).not.toBeNull()
      expect(option.querySelector(`.${color}`), label).not.toBeNull()
    }
  })
  it("starts expanded, preserves filters on collapse, submits Enter and really clears filters on reset", async () => {
    const model = reactive<Api.Notification.AnnouncementListQuery>({
      page: 2,
      pageSize: 10,
      category: "custom",
      status: "scheduled",
      displayMode: "top_banner",
    })
    const search = vi.fn()
    await mount(() => h(AnnouncementSearch, { model, onSearch: search }))
    const collapse = host.querySelector(".n-collapse-item")!
    expect(collapse.classList.contains("n-collapse-item--active")).toBe(true)
    host.querySelector<HTMLElement>(".n-collapse-item__header-main")!.click()
    await settle()
    expect(collapse.classList.contains("n-collapse-item--active")).toBe(false)
    expect(model.category).toBe("custom")
    host.querySelector<HTMLElement>(".n-collapse-item__header-main")!.click()
    await settle()
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(search).toHaveBeenCalledOnce()
    const reset = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes("重置"))!
    reset.click()
    await settle()
    expect(model).toEqual({ page: 2, pageSize: 10, category: undefined, status: undefined, displayMode: undefined })
    expect(search).toHaveBeenCalledTimes(2)
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("")
    expect(host.querySelectorAll(".n-base-selection-placeholder")).toHaveLength(2)
  })
})

describe("announcement list mutation confirmation", () => {
  it("requires confirmation, guards duplicate requests, keeps failed actions open and refreshes the current page", async () => {
    api.check.mockResolvedValue({ data: { current: null, scheduled: null }, error: null })
    api.refresh.mockResolvedValue(undefined)
    api.list.mockImplementation(async (query) => ({
      data: { records: [row()], total: 20, page: query.page, pageSize: 10 },
      error: null,
    }))
    const originalDialog = window.$dialog
    window.$dialog = { warning: api.warning } as unknown as typeof window.$dialog
    try {
      await mount(() => h(AnnouncementList))
      await vi.waitFor(() => expect(host.textContent).toContain("标题{username}"))
      const page2 = [...host.querySelectorAll<HTMLElement>(".n-pagination-item")].find(
        (item) => item.textContent?.trim() === "2",
      )!
      page2.click()
      await vi.waitFor(() => expect(api.list.mock.calls.at(-1)?.[0].page).toBe(2))
      const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (item) => item.getAttribute("aria-label") === "更多",
      )!
      more.click()
      await vi.waitFor(() => expect(document.querySelector(".n-dropdown-menu")).not.toBeNull())
      const remove = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
        item.textContent?.includes("删除草稿"),
      )!
      remove.click()
      await settle()
      expect(api.remove).not.toHaveBeenCalled()
      expect(api.warning).toHaveBeenCalledOnce()
      const dialog = api.warning.mock.calls[0]![0]
      expect(dialog.content).toContain("无法恢复")
      let finish!: (value: { error: object }) => void
      api.remove.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const first = dialog.onPositiveClick()
      expect(await dialog.onPositiveClick()).toBe(false)
      expect(api.remove).toHaveBeenCalledOnce()
      finish({ error: { message: "failed" } })
      expect(await first).toBe(false)
      api.remove.mockResolvedValueOnce({ error: null })
      expect(await dialog.onPositiveClick()).toBe(true)
      expect(api.remove).toHaveBeenCalledTimes(2)
      expect(api.list.mock.calls.at(-1)?.[0].page).toBe(2)
    } finally {
      window.$dialog = originalDialog
    }
  })
})

it("destroys a stale announcement confirmation and rejects its callback after permission revocation", async () => {
  api.remove.mockClear()
  api.warning.mockReset()
  const destroy = vi.fn()
  api.warning.mockReturnValue({ destroy })
  api.check.mockResolvedValue({ data: { current: null, scheduled: null }, error: null })
  api.list.mockResolvedValue({ data: { records: [row()], page: 1, pageSize: 20, total: 1 }, error: null })
  const originalDialog = window.$dialog
  window.$dialog = { warning: api.warning } as unknown as typeof window.$dialog
  try {
    await mount(() => h(AnnouncementList))
    await vi.waitFor(() => expect(host.textContent).toContain("标题{username}"))
    host.querySelector<HTMLButtonElement>('[aria-label="更多"]')!.click()
    await vi.waitFor(() => expect(document.querySelector(".n-dropdown-menu")).not.toBeNull())
    const remove = [...document.querySelectorAll<HTMLElement>(".n-dropdown-option-body")].find((item) =>
      item.textContent?.includes("删除草稿"),
    )!
    remove.click()
    await settle()
    const confirmation = api.warning.mock.calls.at(-1)![0]
    currentAccess.allowed = false
    await settle()
    expect(destroy).toHaveBeenCalledOnce()
    expect(await confirmation.onPositiveClick()).toBe(false)
    expect(api.remove).not.toHaveBeenCalled()
  } finally {
    window.$dialog = originalDialog
  }
})

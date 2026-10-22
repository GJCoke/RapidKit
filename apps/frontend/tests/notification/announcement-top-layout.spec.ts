// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import AdminLayout from "@/materials/libs/admin-layout/index.vue"
import styles from "@/materials/libs/admin-layout/index.module.css"
import type { AdminLayoutProps } from "@/materials/types"

const resize = vi.hoisted(() => ({ notify: undefined as undefined | ((entries: ResizeObserverEntry[]) => void) }))
vi.mock("@vueuse/core", () => ({
  useResizeObserver: (_target: unknown, callback: (entries: ResizeObserverEntry[]) => void) => {
    resize.notify = callback
  },
}))
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement

afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe("global announcement layout", () => {
  it.each([
    { mode: "vertical", scrollMode: "content" },
    { mode: "vertical", scrollMode: "wrapper", siderCollapse: true },
    { mode: "horizontal", scrollMode: "content" },
    { mode: "horizontal", scrollMode: "wrapper" },
    { mode: "vertical", scrollMode: "content", isMobile: true },
    { mode: "vertical", scrollMode: "content", fullContent: true },
  ] satisfies AdminLayoutProps[])("places the announcement before and across all chrome: %j", async (config) => {
    const props = reactive<AdminLayoutProps>({ ...config, bannerVisible: true })
    host = document.createElement("div")
    document.body.append(host)
    app = createApp({
      render: () =>
        h(AdminLayout, props, {
          banner: () => h("div", { "data-testid": "banner" }, "Global notice"),
          header: () => h("div", { "data-testid": "header" }, "Navigation"),
          sider: () => h("div", "Menu"),
          tab: () => h("div", "Tabs"),
          default: () => h("div", "Page"),
        }),
    })
    app.mount(host)
    await nextTick()
    resize.notify!([
      { borderBoxSize: [{ blockSize: 44 }], contentRect: { height: 44 } } as unknown as ResizeObserverEntry,
    ])
    await nextTick()
    const banner = host.querySelector('[data-testid="banner"]')!
    const header = host.querySelector('[data-testid="header"]')!
    expect(banner.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(banner.parentElement!.classList.contains(styles["left-gap"])).toBe(false)
    expect(banner.parentElement!.classList.contains(styles["left-gap_collapsed"])).toBe(false)
    expect((host.firstElementChild as HTMLElement).style.getPropertyValue("--soy-banner-height")).toBe("44px")
    props.bannerVisible = false
    await nextTick()
    expect(host.querySelector('[data-testid="banner"]')).toBeNull()
    expect((host.firstElementChild as HTMLElement).style.getPropertyValue("--soy-banner-height")).toBe("0px")
  })
})

// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { expect, it, vi } from "vitest"
import MenuPage from "@/views/manage/menu/index.vue"
const fixture = vi.hoisted(() => ({
  drawer: null as null | { operateType: string; rowData: { id: string } },
  allowed: true,
}))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => {
    const hasAuth = (code: string) => fixture.allowed && code === "menu:create"
    return {
      hasAuth,
      getActionContext: () => ({
        ready: true,
        hasAuth,
        actorId: "actor",
        isAdmin: false,
        impersonating: false,
        locale: "zh-CN",
      }),
    }
  },
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/service/api", () => ({
  fetchGetMenuList: async () => ({
    data: { records: [{ id: "page-parent", menuType: "2", menuName: "Page" }], page: 1, pageSize: 20, total: 1 },
    error: null,
  }),
  fetchGetAllPages: async () => ({ data: [], error: null }),
  fetchBatchDeleteMenus: vi.fn(),
  fetchDeleteMenu: vi.fn(),
}))
vi.mock("@/views/manage/menu/modules/menu-operate-modal.vue", () => ({
  default: {
    props: ["rowData", "operateType", "visible"],
    setup: (props: { operateType: string; rowData: { id: string } }) => {
      fixture.drawer = props
      return () => h("div")
    },
  },
}))
vi.mock("naive-ui", () => ({
  NCard: {
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h("div", slots.default?.() as never),
  },
  NButton: {
    props: ["onClick"],
    setup:
      (props: { onClick: () => void }, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h("button", { onClick: props.onClick }, slots.default?.() as never),
  },
  NPopconfirm: {},
  NTag: {},
  NDataTable: {
    props: ["data", "columns"],
    setup: (props: { data: object[]; columns: Array<{ key: string; render: (row: object) => unknown }> }) => () =>
      h(
        "div",
        props.data.flatMap((row) =>
          props.columns.filter((column) => column.key === "operate").map((column) => column.render(row)),
        ) as never,
      ),
  },
}))

it("offers add-child on a page row and forwards the selected parent to the dialog", async () => {
  const host = document.createElement("div")
  const app = createApp({ render: () => h(MenuPage) })
  try {
    app.mount(host)
    await vi.waitFor(() => expect(host.textContent).toContain("page.manage.menu.addChildMenu"))
    host.querySelector("button")!.click()
    await nextTick()
    expect(fixture.drawer).toMatchObject({ operateType: "addChild", rowData: { id: "page-parent" } })
  } finally {
    app.unmount()
  }
})

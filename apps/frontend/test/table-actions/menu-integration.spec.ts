// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { beforeEach, expect, it, vi } from "vitest"
import { fetchDeleteMenu, fetchGetMenuList } from "@/service/api"
import MenuPage from "@/views/manage/menu/index.vue"
type MenuRow = { id: string; menuType: string; menuName: string; children?: MenuRow[] }
const fixture = vi.hoisted(() => ({
  drawer: null as null | { operateType: string; rowData: { id: string } },
  allowed: true,
  codes: ["menu:create"],
  records: [] as MenuRow[],
}))
beforeEach(() => {
  vi.clearAllMocks()
  fixture.allowed = true
  fixture.codes = ["menu:create"]
  fixture.records = [
    {
      id: "page-parent",
      menuType: "2",
      menuName: "Page",
      children: [
        {
          id: "child",
          menuType: "2",
          menuName: "Child",
          children: [{ id: "grandchild", menuType: "2", menuName: "Grandchild" }],
        },
      ],
    },
  ]
})
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => {
    const hasAuth = (code: string) => fixture.allowed && fixture.codes.includes(code)
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
  fetchGetMenuList: vi.fn(async () => ({
    data: { records: fixture.records, page: 1, pageSize: 20, total: 1 },
    error: null,
  })),
  fetchGetAllPages: async () => ({ data: [], error: null }),
  fetchBatchDeleteMenus: vi.fn(),
  fetchDeleteMenu: vi.fn(async () => ({ error: null })),
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
  NPopconfirm: {
    props: ["onPositiveClick"],
    setup: (props: { onPositiveClick: () => unknown }, { slots }: { slots: Record<string, () => unknown> }) => {
      const visible = ref(false)
      return () =>
        h("div", [
          h(
            "span",
            {
              onClick: () => {
                visible.value = true
              },
            },
            slots.trigger?.() as never,
          ),
          visible.value ? h("button", { "data-confirm": true, onClick: props.onPositiveClick }, "confirm") : null,
        ])
    },
  },
  NTag: {},
  NDataTable: {
    props: ["data", "columns"],
    setup: (props: { data: MenuRow[]; columns: Array<{ key: string; render: (row: MenuRow) => unknown }> }) => {
      const renderRows = (rows: MenuRow[]): ReturnType<typeof h>[] =>
        rows.map((row) =>
          h("div", [
            h(
              "div",
              { "data-menu-id": row.id },
              props.columns.filter((column) => column.key === "operate").map((column) => column.render(row)) as never,
            ),
            ...renderRows(row.children ?? []),
          ]),
        )
      return () => h("div", renderRows(props.data))
    },
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

it.each(["page-parent", "child", "grandchild"])(
  "deletes %s after confirmation and reloads the menu tree",
  async (id) => {
    fixture.codes = ["menu:delete"]
    const host = document.createElement("div")
    const app = createApp({ render: () => h(MenuPage) })
    try {
      app.mount(host)
      await vi.waitFor(() => expect(host.querySelector(`[data-menu-id="${id}"] button`)).not.toBeNull())
      host.querySelector<HTMLButtonElement>(`[data-menu-id="${id}"] button`)!.click()
      await nextTick()
      expect(fetchDeleteMenu).not.toHaveBeenCalled()
      host.querySelector<HTMLButtonElement>(`[data-menu-id="${id}"] [data-confirm]`)!.click()
      await vi.waitFor(() => expect(fetchDeleteMenu).toHaveBeenCalledExactlyOnceWith(id))
      await vi.waitFor(() => expect(fetchGetMenuList).toHaveBeenCalledTimes(2))
    } finally {
      app.unmount()
    }
  },
)

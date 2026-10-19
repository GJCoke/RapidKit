// @vitest-environment jsdom
import { createApp, h, reactive } from "vue"
import { expect, it, vi } from "vitest"
import DepartmentPage from "@/views/manage/department/index.vue"
import type { TreeOption } from "naive-ui"
const permission = reactive({ allowed: false })
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => {
    const hasAuth = () => permission.allowed
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
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/service/api", () => ({
  fetchGetDepartmentTree: async () => ({
    error: null,
    data: [{ id: "dept-1", name: "Department", code: "DEPT-A", status: "1", children: [] }],
  }),
  fetchDeleteDepartment: vi.fn(),
}))
vi.mock("@/views/manage/department/modules/department-operate-drawer.vue", () => ({ default: { render: () => null } }))
vi.mock("naive-ui", () => {
  const slot = {
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h("span", slots.default?.() as never),
  }
  return {
    NCard: slot,
    NSpin: slot,
    NSpace: slot,
    NTag: slot,
    NEmpty: slot,
    NButton: {
      setup:
        (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
        () =>
          h("button", slots.default?.() as never),
    },
    NPopconfirm: {
      setup:
        (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
        () =>
          slots.trigger?.(),
    },
    NTree: {
      props: ["data", "renderSuffix"],
      setup: (props: { data: TreeOption[]; renderSuffix: (arg: { option: TreeOption }) => unknown }) => () =>
        h("div", props.data.map((option) => props.renderSuffix({ option })) as never),
    },
  }
})

it("retains department metadata when the operation group is empty and restores only the buttons", async () => {
  const host = document.createElement("div")
  const app = createApp({ render: () => h(DepartmentPage) })
  try {
    app.mount(host)
    await vi.waitFor(() => expect(host.textContent).toContain("DEPT-A"))
    expect(host.querySelectorAll("button")).toHaveLength(0)
    expect(host.textContent).toContain("common.status.enable")
    permission.allowed = true
    await vi.waitFor(() => expect(host.querySelectorAll("button")).toHaveLength(3))
    permission.allowed = false
    await vi.waitFor(() => expect(host.querySelectorAll("button")).toHaveLength(0))
    expect(host.textContent).toContain("DEPT-A")
  } finally {
    app.unmount()
    permission.allowed = false
  }
})

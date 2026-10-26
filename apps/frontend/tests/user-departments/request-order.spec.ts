// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue"
import { expect, it, vi } from "vitest"
import UserPage from "@/views/manage/user/index.vue"

const api = vi.hoisted(() => ({ users: vi.fn() }))
vi.mock("@/service/api", () => ({
  fetchGetUserList: api.users,
  fetchGetAllRoles: async () => ({ error: null, data: [] }),
  fetchGetDepartmentTree: async () => ({ error: null, data: [{ id: "root", name: "Engineering", children: [] }] }),
  fetchGetUserDepartmentCounts: async () => ({
    error: null,
    data: { total: 1, unassigned: 0, departments: { root: 1 } },
  }),
  fetchDeleteDepartment: vi.fn(),
  fetchDeleteUser: vi.fn(),
  fetchBatchDeleteUsers: vi.fn(),
  fetchResendInvite: vi.fn(),
}))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN", isMobile: false }) }))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => ({ userInfo: { id: "actor", restrictedFields: {} } }) }))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => ({
    hasAuth: () => false,
    getActionContext: () => ({
      ready: true,
      actorId: "actor",
      isAdmin: false,
      impersonating: false,
      hasAuth: () => false,
      locale: "zh-CN",
    }),
  }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/views/manage/user/modules/department-operate-drawer.vue", () => ({ default: { render: () => null } }))
vi.mock("@/views/manage/user/modules/user-operate-drawer.vue", () => ({ default: { render: () => null } }))
vi.mock("@/views/manage/user/modules/change-password-modal.vue", () => ({ default: { render: () => null } }))
vi.mock("@/components/impersonation/impersonation-confirm-modal.vue", () => ({ default: { render: () => null } }))

function result(name: string) {
  return {
    error: null,
    data: {
      records: [
        { id: name, name, username: name, email: `${name}@example.com`, roles: [], status: "1", departmentId: "root" },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  }
}

it("a slow previous department request cannot replace the current department's users", async () => {
  let resolveOld!: (value: ReturnType<typeof result>) => void
  api.users
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValue(result("CurrentUser"))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(UserPage)
  app.mount(host)
  try {
    await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
    const department = [...host.querySelectorAll<HTMLElement>(".n-tree-node-content")].find((node) =>
      node.textContent?.includes("Engineering"),
    )!
    department.click()
    await vi.waitFor(() => expect(host.textContent).toContain("CurrentUser"))
    expect(api.users.mock.lastCall?.[0]).toMatchObject({ departmentId: "root", includeChildren: true, page: 1 })
    resolveOld(result("ObsoleteUser"))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(host.textContent).toContain("CurrentUser")
    expect(host.textContent).not.toContain("ObsoleteUser")
  } finally {
    app.unmount()
    host.remove()
    vi.unstubAllGlobals()
  }
})

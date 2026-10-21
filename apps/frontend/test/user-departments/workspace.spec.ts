// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import DepartmentPanel from "@/views/manage/user/modules/department-panel.vue"

const api = vi.hoisted(() => ({ tree: vi.fn(), counts: vi.fn() }))
const auth = vi.hoisted(() => ({ allowed: new Set<string>() }))
vi.mock("@/service/api", () => ({
  fetchGetDepartmentTree: api.tree,
  fetchGetUserDepartmentCounts: api.counts,
  fetchDeleteDepartment: vi.fn(),
  fetchCreateDepartment: vi.fn(),
  fetchUpdateDepartment: vi.fn(),
  fetchGetAllUsers: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock("@/hooks/business/auth", () => ({
  useAuth: () => ({ hasAuth: (permission: string) => auth.allowed.has(permission) }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

const tree = [
  {
    id: "root",
    name: "Company",
    code: "HQ",
    status: "1",
    parentId: null,
    children: [{ id: "child", name: "Engineering", code: "ENG", status: "1", parentId: "root", children: [] }],
  },
]
const cleanups: Array<() => void> = []

beforeEach(() => {
  auth.allowed.clear()
  api.tree.mockReset().mockResolvedValue({ data: tree, error: null })
  api.counts
    .mockReset()
    .mockResolvedValue({ data: { total: 4, unassigned: 1, departments: { root: 1, child: 2 } }, error: null })
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
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

function mount(selected = "all") {
  const selectedId = ref(selected)
  const host = document.createElement("div")
  document.body.append(host)
  const panel = ref<{ reload: () => Promise<void> }>()
  const app = createApp({
    render: () =>
      h(DepartmentPanel, {
        ref: panel,
        selectedId: selectedId.value,
        "onUpdate:selectedId": (value: string) => {
          selectedId.value = value
        },
      }),
  })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, selectedId, panel }
}

it("shows subtree totals and selecting a tree row changes the active department", async () => {
  const { host, selectedId } = mount()
  await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
  const rootRow = [...host.querySelectorAll(".n-tree-node")].find((node) => node.textContent?.includes("Company"))!
  expect(rootRow.textContent).toContain("3")
  const label = [...host.querySelectorAll(".n-tree-node-content")].find((node) =>
    node.textContent?.includes("Engineering"),
  )!
  ;(label as HTMLElement).click()
  await nextTick()
  expect(selectedId.value).toBe("child")
})

it("returns to all users when the selected department was deleted", async () => {
  const { host, selectedId, panel } = mount("child")
  await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
  api.tree.mockResolvedValue({ data: [], error: null })
  await panel.value!.reload()
  expect(selectedId.value).toBe("all")
})

it("selects a parent without toggling expansion until its arrow is clicked", async () => {
  const { host, selectedId } = mount()
  await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
  const root = host.querySelector('[data-department-count="root"]')!.closest(".n-tree-node")!
  ;(root.querySelector(".n-tree-node-content") as HTMLElement).click()
  await nextTick()
  expect(selectedId.value).toBe("root")
  expect(root.querySelector(".n-tree-node-switcher--expanded")).not.toBeNull()
  ;(root.querySelector(".n-tree-node-switcher") as HTMLElement).click()
  await nextTick()
  expect(root.querySelector(".n-tree-node-switcher--expanded")).toBeNull()
  expect(selectedId.value).toBe("root")
})

it("edits the node whose menu was opened without changing the active filter", async () => {
  auth.allowed.add("department:update")
  const { host, selectedId } = mount()
  await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
  const menuButton = host
    .querySelector('[data-department-count="child"]')!
    .closest(".n-tree-node")!
    .querySelector("button") as HTMLButtonElement
  expect(menuButton).not.toBeNull()
  menuButton.click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("page.manage.department.editDepartment"))
  const edit = [...document.querySelectorAll(".n-dropdown-option-body")].find(
    (option) => option.textContent === "page.manage.department.editDepartment",
  ) as HTMLElement
  edit.click()
  await vi.waitFor(() => {
    const name = document.querySelector('input[placeholder="page.manage.department.form.name"]') as HTMLInputElement
    expect(name?.value).toBe("Engineering")
  })
  expect(selectedId.value).toBe("all")
})

it("does not let an older tree request overwrite the latest tree", async () => {
  let resolveOld!: (value: unknown) => void
  api.tree.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const { host, panel } = mount()
  await panel.value!.reload()
  resolveOld({ data: [{ ...tree[0], name: "Obsolete", children: [] }], error: null })
  await nextTick()
  await nextTick()
  expect(host.textContent).toContain("Engineering")
  expect(host.textContent).not.toContain("Obsolete")
})

it("shows a retry state on tree failure and unknown counts on count failure", async () => {
  api.tree.mockResolvedValueOnce({ data: null, error: new Error("offline") })
  const { host, panel } = mount()
  await vi.waitFor(() => expect(host.textContent).toContain("page.manage.user.directory.loadFailed"))
  api.counts.mockResolvedValue({ data: null, error: new Error("offline") })
  await panel.value!.reload()
  expect(host.textContent).toContain("Engineering")
  expect(host.querySelector('[data-department-count="child"]')?.textContent).toBe("—")
})

it("does not invent subtree totals when the department scope hides some user departments", async () => {
  api.tree.mockResolvedValue({ data: [{ ...tree[0], children: [] }], error: null })
  const { host } = mount()
  await vi.waitFor(() => expect(host.textContent).toContain("Company"))
  expect(host.querySelector('[data-department-count="root"]')?.textContent).toBe("—")
})

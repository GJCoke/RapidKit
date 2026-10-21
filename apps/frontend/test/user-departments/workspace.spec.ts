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
  await vi.waitFor(() => expect(root.querySelector(".n-tree-node-switcher--expanded")).toBeNull())
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

it("highlights department matches and clears an empty search without changing the active filter", async () => {
  const { host, selectedId } = mount("child")
  await vi.waitFor(() => expect(host.textContent).toContain("Engineering"))
  const input = host.querySelector(
    'input[placeholder="page.manage.user.directory.searchDepartments"]',
  ) as HTMLInputElement
  input.value = "engineer"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  expect(host.querySelector("mark")?.textContent).toBe("Engineer")
  expect(host.textContent).toContain("Company")
  input.value = "missing department"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  expect(host.textContent).toContain("page.manage.user.directory.noResults")
  const clear = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("page.manage.user.directory.clearSearch"),
  )!
  clear.click()
  await nextTick()
  expect(input.value).toBe("")
  expect(host.querySelector('[data-department-count="child"]')).not.toBeNull()
  expect(selectedId.value).toBe("child")
})

function deepFixture(depth = 8) {
  let children: unknown[] = []
  for (let level = depth; level >= 1; level--) {
    children = [
      {
        ...tree[0],
        id: `level-${level}`,
        name: level === 8 ? "Shared team" : `Level ${level}`,
        parentId: level > 1 ? `level-${level - 1}` : null,
        children,
      },
    ]
  }
  return children
}

function treeRow(host: HTMLElement, id: string) {
  return host.querySelector(`[data-department-count="${id}"]`)?.closest(".n-tree-node") as HTMLElement
}

async function enterFourthLevel(host: HTMLElement) {
  await vi.waitFor(() => expect(treeRow(host, "level-3")).toBeTruthy())
  ;(treeRow(host, "level-3").querySelector(".n-tree-node-switcher") as HTMLElement).click()
  await vi.waitFor(() => expect(host.querySelector('[data-department-enter="level-4"]')).not.toBeNull())
  ;(host.querySelector('[data-department-enter="level-4"]') as HTMLElement).click()
  await nextTick()
}

it("opens only the first two levels by default", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host } = mount()
  await vi.waitFor(() => expect(treeRow(host, "level-3")).toBeTruthy())
  expect(treeRow(host, "level-3").querySelector(".n-tree-node-switcher--expanded")).toBeNull()
  expect(treeRow(host, "level-4")).toBeFalsy()
})

it("enters deep branches and returns home without changing the selected department or subtree totals", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  api.counts.mockResolvedValue({ data: { total: 3, unassigned: 0, departments: { "level-8": 3 } }, error: null })
  const { host, selectedId } = mount()
  await enterFourthLevel(host)
  expect(treeRow(host, "level-1")).toBeFalsy()
  expect(host.querySelector('[data-department-count="level-4"]')?.textContent).toBe("3")
  expect(selectedId.value).toBe("all")
  ;(treeRow(host, "level-6").querySelector(".n-tree-node-content") as HTMLElement).click()
  await nextTick()
  expect(selectedId.value).toBe("level-6")
  ;(host.querySelector("[data-department-back]") as HTMLElement).click()
  await nextTick()
  expect(treeRow(host, "level-3")).toBeTruthy()
  expect(selectedId.value).toBe("level-6")
  ;(host.querySelector("[data-department-home]") as HTMLElement).click()
  await nextTick()
  expect(treeRow(host, "level-1")).toBeTruthy()
  expect(treeRow(host, "level-5")).toBeFalsy()
  expect(selectedId.value).toBe("level-6")
})

it("jumps to an ancestor through the complete breadcrumb path", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host, selectedId } = mount()
  await enterFourthLevel(host)
  ;(host.querySelector("[data-department-ancestors]") as HTMLElement).click()
  await vi.waitFor(() => expect(document.querySelector('[data-department-ancestor="level-2"]')).not.toBeNull())
  ;(document.querySelector('[data-department-ancestor="level-2"]') as HTMLElement).click()
  await nextTick()
  expect(treeRow(host, "level-2")).toBeTruthy()
  expect(treeRow(host, "level-1")).toBeFalsy()
  expect(selectedId.value).toBe("all")
})

it("searches all branches with distinguishing paths and locates the selected result", async () => {
  api.tree.mockResolvedValue({
    data: [
      ...deepFixture(),
      {
        ...tree[0],
        id: "other",
        name: "Other company",
        children: [{ ...tree[0], id: "duplicate", name: "Shared team", parentId: "other", children: [] }],
      },
    ],
    error: null,
  })
  const { host, selectedId } = mount()
  await enterFourthLevel(host)
  const input = host.querySelector(
    'input[placeholder="page.manage.user.directory.searchDepartments"]',
  ) as HTMLInputElement
  input.value = "shared"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  const results = host.querySelectorAll("[data-department-result]")
  expect(results).toHaveLength(2)
  expect(results[0].textContent).toContain("Level 1 / Level 2")
  expect(results[1].textContent).toContain("Other company")
  ;(host.querySelector('[data-department-result="level-8"]') as HTMLElement).click()
  await nextTick()
  expect(selectedId.value).toBe("level-8")
  expect(input.value).toBe("")
  expect(treeRow(host, "level-6")).toBeTruthy()
  expect(treeRow(host, "level-8")).toBeTruthy()
})

it("recovers the nearest surviving ancestor when the scoped department is deleted", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host, selectedId, panel } = mount()
  await enterFourthLevel(host)
  api.tree.mockResolvedValue({ data: deepFixture(3), error: null })
  await panel.value!.reload()
  await nextTick()
  expect(treeRow(host, "level-3")).toBeTruthy()
  expect(treeRow(host, "level-1")).toBeFalsy()
  expect(selectedId.value).toBe("all")
})

it("uses keyboard expansion to enter the same depth boundary", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host, selectedId } = mount()
  await vi.waitFor(() => expect(treeRow(host, "level-3")).toBeTruthy())
  const directory = host.querySelector(".department-tree")!
  for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowRight"]) {
    directory.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    await nextTick()
    if (key === "ArrowRight") await vi.waitFor(() => expect(host.querySelector(".n-tree-motion-wrapper")).toBeNull())
  }
  expect(treeRow(host, "level-1")).toBeFalsy()
  expect(treeRow(host, "level-4")).toBeTruthy()
  expect(selectedId.value).toBe("all")
})

it("keeps keyboard navigation working when the selected filter is outside the visible tree levels", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host, selectedId } = mount()
  await enterFourthLevel(host)
  ;(treeRow(host, "level-6").querySelector(".n-tree-node-content") as HTMLElement).click()
  await nextTick()
  ;(host.querySelector("[data-department-back]") as HTMLElement).click()
  await nextTick()
  const directory = host.querySelector(".department-tree")!
  for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]) {
    directory.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    await nextTick()
  }
  expect(treeRow(host, "level-3")).toBeFalsy()
  expect(treeRow(host, "level-5")).toBeTruthy()
  expect(selectedId.value).toBe("level-6")
})

it("updates the breadcrumb when the scoped department moves under another root", async () => {
  api.tree.mockResolvedValue({ data: deepFixture(), error: null })
  const { host, panel } = mount()
  await enterFourthLevel(host)
  let scoped = (deepFixture() as Api.SystemManage.DepartmentTree[])[0]
  for (let level = 1; level < 4; level++) scoped = scoped.children![0]
  api.tree.mockResolvedValue({
    data: [{ ...tree[0], id: "moved-root", name: "Moved company", children: [{ ...scoped, parentId: "moved-root" }] }],
    error: null,
  })
  await panel.value!.reload()
  await nextTick()
  expect(host.querySelector(".department-browse")?.textContent).toContain("Moved company")
  expect(host.querySelector(".department-browse")?.textContent).not.toContain("Level 1")
  expect(treeRow(host, "level-4")).toBeTruthy()
})

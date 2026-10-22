import { readFile } from "node:fs/promises"
import { ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock("@/service/request", () => ({ request: mocks.request }))

import { fetchGetActiveMenuOptions } from "@/service/api/system-manage"
import {
  createActiveMenuOptionsLoader,
  watchActiveMenuPartition,
} from "@/views/manage/menu/modules/active-menu-options"

const modalSource = await readFile(
  new URL("../../src/views/manage/menu/modules/menu-operate-modal.vue", import.meta.url),
  "utf8",
)

describe("active menu binding", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests ancestor candidates by parent id and constant partition", async () => {
    mocks.request.mockResolvedValue({ data: [], error: null })

    await fetchGetActiveMenuOptions("parent-1", true)

    expect(mocks.request).toHaveBeenCalledWith({
      url: "/manage/menus/active-menu-options",
      method: "get",
      params: { parentId: "parent-1", constant: true },
    })
  })

  it("keeps activeMenu optional and loads only ancestor candidates", () => {
    expect(modalSource).toContain('v-if="model.hideInMenu"')
    expect(modalSource).toContain('v-model:value="model.activeMenu"')
    expect(modalSource).toContain(':options="activeMenuOptions"')
    expect(modalSource).toContain("fetchGetActiveMenuOptions")
    expect(modalSource).not.toMatch(/activeMenu:\s*defaultRequiredRule/)
    expect(modalSource).toContain("loadActiveMenuOptions(model.value.parentId, model.value.constant === true)")
    expect(modalSource).toContain("watchActiveMenuPartition")
  })

  it("maps ancestor candidates into select options", async () => {
    const fetchOptions = vi.fn().mockResolvedValue({
      data: [{ id: "menu-1", menuName: "Users", routeName: "manage_user" }],
      error: null,
    })
    const loader = createActiveMenuOptionsLoader(fetchOptions)

    await loader.load("parent-1", false)

    expect(fetchOptions).toHaveBeenCalledWith("parent-1", false)
    expect(loader.activeMenuOptions.value).toEqual([{ label: "Users (manage_user)", value: "manage_user" }])
  })

  it("clears options when a candidate request fails", async () => {
    const fetchOptions = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "menu-1", menuName: "Users", routeName: "manage_user" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: new Error("unavailable") })
    const loader = createActiveMenuOptionsLoader(fetchOptions)

    await loader.load("parent-1", false)
    await loader.load("parent-2", true)

    expect(loader.activeMenuOptions.value).toEqual([])
  })

  it("clears immediately and ignores a stale response after the constant partition changes", async () => {
    const first = deferred<{ data: Api.SystemManage.ActiveMenuOption[]; error: null }>()
    const second = deferred<{ data: Api.SystemManage.ActiveMenuOption[]; error: null }>()
    const fetchOptions = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const loader = createActiveMenuOptionsLoader(fetchOptions)
    loader.activeMenuOptions.value = [{ label: "Previous", value: "previous" }]

    const firstLoad = loader.load("parent-a", false)
    expect(loader.activeMenuOptions.value).toEqual([])

    const secondLoad = loader.load("parent-a", true)

    second.resolve({ data: [{ id: "menu-b", menuName: "Roles", routeName: "manage_role" }], error: null })
    await secondLoad
    first.resolve({ data: [{ id: "menu-a", menuName: "Users", routeName: "manage_user" }], error: null })
    await firstLoad

    expect(fetchOptions).toHaveBeenNthCalledWith(1, "parent-a", false)
    expect(fetchOptions).toHaveBeenNthCalledWith(2, "parent-a", true)
    expect(loader.activeMenuOptions.value).toEqual([{ label: "Roles (manage_role)", value: "manage_role" }])
  })

  it("clears options for a root menu and ignores an in-flight child response", async () => {
    const childRequest = deferred<{ data: Api.SystemManage.ActiveMenuOption[]; error: null }>()
    const fetchOptions = vi.fn().mockReturnValue(childRequest.promise)
    const loader = createActiveMenuOptionsLoader(fetchOptions)

    const childLoad = loader.load("parent-1", false)
    await loader.load(null, false)
    childRequest.resolve({ data: [{ id: "menu-1", menuName: "Users", routeName: "manage_user" }], error: null })
    await childLoad

    expect(fetchOptions).toHaveBeenCalledTimes(1)
    expect(loader.activeMenuOptions.value).toEqual([])
  })

  it("clears the selected active menu before loading a user-selected partition", () => {
    const model = ref({ parentId: "parent-1", constant: false, activeMenu: "manage_user" })
    const visible = ref(true)
    const loadOptions = vi.fn()
    const stop = watchActiveMenuPartition(model, visible, () => false, loadOptions)

    model.value.constant = true

    expect(model.value.activeMenu).toBeNull()
    expect(loadOptions).toHaveBeenCalledWith("parent-1", true)
    stop()
  })

  it("preserves the selected active menu during edit-model hydration", () => {
    const model = ref({ parentId: "parent-1", constant: false, activeMenu: null as string | null })
    const visible = ref(true)
    const loadOptions = vi.fn()
    let hydrating = true
    const stop = watchActiveMenuPartition(model, visible, () => hydrating, loadOptions)

    model.value = { parentId: "parent-1", constant: true, activeMenu: "constant_dashboard" }
    hydrating = false

    expect(model.value.activeMenu).toBe("constant_dashboard")
    expect(loadOptions).not.toHaveBeenCalled()
    stop()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

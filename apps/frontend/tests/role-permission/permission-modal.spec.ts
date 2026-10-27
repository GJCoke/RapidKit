// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { NConfigProvider } from "naive-ui"
import { afterEach, expect, it, vi } from "vitest"
import { menu, notificationCatalog, notificationCodes, notificationMenus, permissionCode } from "./fixtures"
import PermissionModal from "@/views/manage/role/modules/permission-modal.vue"

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  permissions: vi.fn(),
  packages: vi.fn(),
  save: vi.fn(),
  menus: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchGetPermissionCatalog: api.catalog,
  fetchGetRolePermissions: api.permissions,
  fetchGetAllPermissionPackages: api.packages,
  fetchUpdateRolePermissions: api.save,
  fetchGetMenuList: api.menus,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/locales", () => ({
  $t: (key: string, params?: { names?: string }) => (key.endsWith(".requiredBy") ? `${key} ${params?.names}` : key),
}))
vi.mock("naive-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("naive-ui")>()
  const { defineComponent, h } = await import("vue")
  return {
    ...actual,
    NSelect: defineComponent({
      props: { value: null, options: null, disabled: Boolean, multiple: Boolean },
      emits: ["update:value"],
      setup(props, { emit, attrs }) {
        return () =>
          h(
            "select",
            {
              ...attrs,
              value: props.value,
              disabled: props.disabled,
              multiple: props.multiple,
              onChange: (event: Event) =>
                emit(
                  "update:value",
                  props.multiple
                    ? [...(event.target as HTMLSelectElement).selectedOptions].map((o) => o.value)
                    : (event.target as HTMLSelectElement).value,
                ),
            },
            props.options.map((o: { label: string; value: string }) => h("option", { value: o.value }, o.label)),
          )
      },
    }),
  }
})
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement | undefined
const warning = vi.fn()
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
const key = (name: string) => `page.manage.role.workbench.${name}`
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label)
  expect(found, label).toBeTruthy()
  return found!
}
function checkbox(label: string, scope: ParentNode = document) {
  const found = [...scope.querySelectorAll<HTMLElement>(".n-checkbox")].find(
    (el) => el.getAttribute("aria-label") === label || el.textContent?.trim() === label,
  )
  expect(found, label).toBeTruthy()
  return found!
}
async function selectPackage() {
  checkbox("User full").click()
  await nextTick()
}
function menuPage(records: Api.SystemManage.Menu[], total = records.length) {
  return { error: null, data: { records, total, page: 1, pageSize: 500 } }
}
async function navigateModule(label: string) {
  const item = [...document.querySelectorAll<HTMLButtonElement>(".resource-nav button")].find((b) =>
    b.textContent?.includes(label),
  )
  expect(item, label).toBeTruthy()
  item!.click()
  await nextTick()
}
async function open(
  options: {
    fail?: boolean
    invalid?: boolean
    codes?: string[]
    modules?: boolean
    menuResults?: ReturnType<typeof menuPage>[]
    catalog?: Api.Permission.Catalog
  } = {},
) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  window.$dialog = { warning } as unknown as NonNullable<Window["$dialog"]>
  api.catalog.mockResolvedValue({
    error: null,
    data: {
      resources: [
        {
          key: "user",
          label: "User",
          dataScopes: [{ key: "self", label: "Self" }],
          fieldGroups: [{ key: "contact", label: "Contact", fields: ["phone"], modes: ["masked", "hidden"] }],
        },
        { key: "role", label: "Role", dataScopes: [], fieldGroups: [] },
        { key: "audit", label: "Audit", dataScopes: [], fieldGroups: [] },
      ],
      codes: [
        { code: "user:stats", resource: "user", label: "User stats", source: "code", abacAction: "read", depends: [] },
        { code: "audit:read", resource: "audit", label: "Read audit", source: "code", abacAction: "read", depends: [] },
        {
          code: "user:read",
          resource: "user",
          label: "Read user",
          source: "code",
          abacAction: "read",
          depends: ["role:options"],
        },
        {
          code: "user:update",
          resource: "user",
          label: "Update user",
          source: "code",
          abacAction: "write",
          depends: ["user:read"],
        },
        {
          code: "role:options",
          resource: "role",
          label: "Role options",
          source: "code",
          abacAction: "read",
          depends: [],
        },
      ],
    },
  })
  api.packages.mockResolvedValue({
    error: null,
    data: [
      {
        key: "role.readonly",
        label: "Role readonly",
        description: "",
        codes: ["role:options"],
        dataScopes: {},
        fieldModes: {},
      },
      {
        key: "user.full",
        label: "User full",
        description: "",
        codes: ["user:read", "user:update"],
        dataScopes: { user: "all" },
        fieldModes: { user: { contact: "visible" } },
      },
    ],
  })
  if (options.modules) api.catalog.mockResolvedValue({ error: null, data: options.catalog ?? notificationCatalog })
  api.menus.mockResolvedValue(
    options.modules ? menuPage(notificationMenus) : { error: new Error("menus unavailable"), data: null },
  )
  for (const result of options.menuResults ?? []) api.menus.mockResolvedValueOnce(result)
  const result = {
    error: null,
    data: {
      permissionCodes: options.codes ?? (options.modules ? [] : ["user:read"]),
      invalidCodes: options.invalid ? ["old:read"] : [],
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
      invalidScopes: options.invalid ? [{ resource: "user", group: null, stored: "region", effective: "self" }] : [],
    },
  }
  api.permissions.mockResolvedValue(options.fail ? { error: new Error("unavailable"), data: null } : result)
  api.save.mockResolvedValue({ error: null })
  const state = reactive({ visible: false, roleId: "role" })
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({
    render: () =>
      h(
        NConfigProvider,
        {},
        {
          default: () =>
            h(PermissionModal, {
              roleId: state.roleId,
              roleName: state.roleId,
              visible: state.visible,
              "onUpdate:visible": (v: boolean) => {
                state.visible = v
              },
            }),
        },
      ),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", redirect: "/roles" },
      { path: "/roles", component: { render: () => null } },
      { path: "/other", component: { render: () => null } },
    ],
  })
  app.use(router)
  await router.push("/roles")
  app.mount(host)
  state.visible = true
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("role"))
  await vi.waitFor(() => expect(button(key("review"))).toBeTruthy())
  if (!options.fail) {
    if (options.modules)
      await vi.waitFor(() =>
        expect(document.querySelector("[data-permission-module], .resource-nav button")).toBeTruthy(),
      )
    else await vi.waitFor(() => expect(checkbox("User full")).toBeTruthy())
  }
  return { state, result, router }
}

it("blocks saving after load failure and supports retry", async () => {
  const { result } = await open({ fail: true })
  expect(button(key("review")).disabled).toBe(true)
  api.permissions.mockResolvedValue(result)
  button(key("retry")).click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("Read user"))
  expect(button(key("review")).disabled).toBe(true) // unchanged
})

it("fills the shared draft, permits manual edits and saves all restrictions once", async () => {
  await open()
  await selectPackage()
  await vi.waitFor(() => expect(button(key("review")).disabled).toBe(false))
  expect(api.save).not.toHaveBeenCalled()
  const read = [...document.querySelectorAll<HTMLElement>(".n-checkbox")].find((el) =>
    el.textContent?.includes("Read user"),
  )!
  read.click() // becomes required by user:update
  await vi.waitFor(() => expect(read.getAttribute("aria-checked")).toBe("true"))
  button(key("review")).click()
  await vi.waitFor(() => expect(button(key("save"))).toBeTruthy())
  button(key("save")).click()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledExactlyOnceWith("role", {
      permissionCodes: ["user:update"],
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

it("retains shortcut changes and manual editing after a failed save", async () => {
  await open()
  await selectPackage()
  button(key("review")).click()
  await nextTick()
  api.save.mockResolvedValue({ error: new Error("offline") })
  button(key("save")).click()
  await vi.waitFor(() => expect(api.save).toHaveBeenCalled())
  await nextTick()
  expect(button(key("save")).disabled).toBe(false)
  button(key("back")).click()
  await nextTick()
  expect(checkbox("User full").getAttribute("aria-checked")).toBe("true")
  button("common.cancel").click()
  expect(warning).toHaveBeenCalled()
})

it("requires explicit removal and normalization of invalid stored grants", async () => {
  await open({ invalid: true })
  expect(button(key("review")).disabled).toBe(true)
  button(key("removeInvalid")).click()
  button(key("repairInvalid")).click()
  await vi.waitFor(() => expect(button(key("review")).disabled).toBe(false))
  button(key("review")).click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("old:read"))
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith("role", {
      permissionCodes: ["user:read"],
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

it("ignores an older load response after switching roles", async () => {
  const { state, result } = await open()
  let finish!: (value: unknown) => void
  api.permissions.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  state.roleId = "older"
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("older"))
  api.permissions.mockResolvedValue({ ...result, data: { ...result.data, permissionCodes: ["user:update"] } })
  state.roleId = "newer"
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("newer"))
  await vi.waitFor(() => expect(checkbox("User full")).toBeTruthy())
  finish(result)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await selectPackage()
  await nextTick()
  button(key("review")).click()
  await vi.waitFor(() => expect(button(key("save"))).toBeTruthy())
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      "newer",
      expect.objectContaining({ permissionCodes: ["user:update", "user:read"] }),
    ),
  )
})

it("keeps an unsaved draft when leaving the route is cancelled", async () => {
  const { router, state } = await open()
  await selectPackage()
  await nextTick()
  const navigation = router.push("/other")
  await vi.waitFor(() => expect(warning).toHaveBeenCalled())
  warning.mock.calls.at(-1)![0].onNegativeClick()
  await navigation
  expect(router.currentRoute.value.path).toBe("/roles")
  expect(state.visible).toBe(true)
  button(key("review")).click()
  await vi.waitFor(() => expect(button(key("save"))).toBeTruthy())
})

it("blocks closing, duplicate saves and route changes while a save is in flight", async () => {
  const { state, router } = await open()
  await selectPackage()
  await nextTick()
  button(key("review")).click()
  await nextTick()
  let finish!: (value: { error: null }) => void
  api.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  button(key("save")).click()
  await nextTick()
  expect(button("common.cancel").disabled).toBe(true)
  expect(button(key("save")).disabled).toBe(true)
  button(key("save")).click()
  await router.push("/other")
  expect(router.currentRoute.value.path).toBe("/roles")
  expect(state.visible).toBe(true)
  expect(api.save).toHaveBeenCalledTimes(1)
  finish({ error: null })
  await vi.waitFor(() => expect(state.visible).toBe(false))
})

it("saves manual scope and field changes through the same reviewed payload", async () => {
  await open()
  const scope = document.querySelector<HTMLSelectElement>('select[aria-label="User / page.manage.role.dataScope"]')!
  scope.value = "all"
  scope.dispatchEvent(new Event("change"))
  const field = document.querySelector<HTMLSelectElement>('select[aria-label="User / Contact"]')!
  field.value = "hidden"
  field.dispatchEvent(new Event("change"))
  await nextTick()
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith("role", {
      permissionCodes: ["user:read"],
      dataScopes: {},
      fieldModes: { user: { contact: "hidden" } },
    }),
  )
})

it("offers only current-resource shortcuts and derives their state from the retained draft", async () => {
  await open()
  await selectPackage()
  const resource = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(".resource-nav button")].find((b) =>
      b.textContent?.includes(name),
    )!
  resource("Role").click()
  await nextTick()
  expect(checkbox("Role readonly").getAttribute("aria-checked")).toBe("false")
  expect(document.body.textContent).not.toContain("User full")
  resource("Audit").click()
  await nextTick()
  expect(document.querySelector(".package-shortcuts")).toBeNull()
  resource("User").click()
  await nextTick()
  expect(checkbox("User full").getAttribute("aria-checked")).toBe("true")
  expect(api.save).not.toHaveBeenCalled()
})

it("bulk-checks and unchecks package codes immediately while retaining other manual grants", async () => {
  await open({ codes: ["user:stats", "role:options"] })
  await selectPackage()
  expect(checkbox("Update user").getAttribute("aria-checked")).toBe("true")
  expect(checkbox("User stats").getAttribute("aria-checked")).toBe("true")
  expect(warning).not.toHaveBeenCalled()
  expect(api.save).not.toHaveBeenCalled()
  await selectPackage()
  expect(checkbox("Read user").getAttribute("aria-checked")).toBe("false")
  expect(checkbox("Update user").getAttribute("aria-checked")).toBe("false")
  expect(checkbox("User stats").getAttribute("aria-checked")).toBe("true")
  expect(button(key("review")).disabled).toBe(true)
  await selectPackage()
  checkbox("Update user").click()
  await nextTick()
  expect(checkbox("User full").classList.contains("n-checkbox--indeterminate")).toBe(true)
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledExactlyOnceWith("role", {
      permissionCodes: ["user:stats", "role:options", "user:read"],
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

it("opens dependency details on click without changing the grant draft", async () => {
  await open({ codes: ["user:update"] })
  expect(document.body.textContent).not.toContain(key("requiredBy"))
  const read = checkbox("Read user")
  read.click()
  await nextTick()
  expect(read.getAttribute("aria-checked")).toBe("true")
  const trigger = button("page.manage.role.implied")
  trigger.click()
  await vi.waitFor(() => expect(document.querySelector(".n-popover")?.textContent).toContain("Update user"))
  expect(read.getAttribute("aria-checked")).toBe("true")
  expect(button(key("review")).disabled).toBe(true)
  expect(api.save).not.toHaveBeenCalled()
  trigger.click()
  await vi.waitFor(() => expect(document.querySelector('.n-popover:not([style*="display: none"])')).toBeNull())
})

it("edits all notification resources in one module and keeps search from narrowing bulk grants", async () => {
  await open({ modules: true })
  await navigateModule("通知管理")
  expect(checkbox("查看模板")).toBeTruthy()
  expect(checkbox("发布公告")).toBeTruthy()
  expect(checkbox("重试失败投递")).toBeTruthy()
  const search = document.querySelector<HTMLInputElement>(`input[placeholder="${key("search")}"]`)!
  search.value = "发布"
  search.dispatchEvent(new Event("input"))
  await nextTick()
  button(key("moduleAll")).click()
  await nextTick()
  expect(api.save).not.toHaveBeenCalled()
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledExactlyOnceWith("role", {
      permissionCodes: notificationCodes.map((c) => c.code),
      dataScopes: { user: "self" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

it("offers four read-only notification operations without granting write dependencies directly", async () => {
  await open({ modules: true })
  await navigateModule("通知管理")
  button(key("moduleAll")).click()
  await nextTick()
  button(key("moduleReadonly")).click()
  await nextTick()
  expect(checkbox("新增公告").getAttribute("aria-checked")).toBe("false")
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      "role",
      expect.objectContaining({
        permissionCodes: [
          "notification-template:read",
          "notification:read",
          "notification:preview",
          "notification-delivery:read",
        ],
      }),
    ),
  )
})

it("loads every menu page before displaying grouped resources", async () => {
  const system = menu("system", {
    menuType: "1",
    menuName: "系统管理",
    children: [menu("user", { permission: "user:options" })],
  })
  await open({ modules: true, menuResults: [menuPage(notificationMenus, 2), menuPage([system], 2)] })
  expect(api.menus).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 500 })
  expect(api.menus).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 500 })
  await navigateModule("系统管理")
  expect(checkbox("编辑用户")).toBeTruthy()
  await navigateModule("通知管理")
  expect(checkbox("查看投递状态")).toBeTruthy()
})

it("falls back on an incomplete menu snapshot and retries without resetting a draft", async () => {
  await open({ modules: true, menuResults: [menuPage(notificationMenus, 2), menuPage([], 2)] })
  await vi.waitFor(() => expect(document.body.textContent).toContain(key("menuLoadFailed")))
  checkbox("编辑用户").click()
  await nextTick()
  button(key("retryMenus")).click()
  await vi.waitFor(() => expect(document.querySelector("[data-permission-module]")).toBeTruthy())
  await navigateModule("通知管理")
  button(key("moduleReadonly")).click()
  await nextTick()
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith(
      "role",
      expect.objectContaining({
        permissionCodes: [
          "user:update",
          "notification-template:read",
          "notification:read",
          "notification:preview",
          "notification-delivery:read",
        ],
      }),
    ),
  )
})

it("ignores stale menu results after a role change", async () => {
  const { state } = await open({ modules: true })
  let finish!: (result: ReturnType<typeof menuPage>) => void
  api.menus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  state.roleId = "older"
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("older"))
  state.roleId = "newer"
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("newer"))
  await navigateModule("通知管理")
  finish(menuPage([menu("stale", { menuName: "STALE", permission: "user:options" })]))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.body.textContent).not.toContain("STALE")
  expect(checkbox("查看模板")).toBeTruthy()
})

it("links shared resources to one editor and retains the same draft across dependency navigation", async () => {
  const shared = menu("z-shared", {
    menuName: "共享模块",
    children: [menu("alias", { permission: "notification:read" })],
    menuType: "1",
  })
  await open({ modules: true, menuResults: [menuPage([...notificationMenus, shared])] })
  await navigateModule("通知管理")
  checkbox("新增公告").click()
  await nextTick()
  await navigateModule("共享模块")
  expect(document.querySelectorAll('.permission-module-editor section[aria-label="公告管理"]')).toHaveLength(0)
  const sharedLink = document.querySelector<HTMLButtonElement>('[data-shared-resource="notification"]')!
  expect(sharedLink).toBeTruthy()
  sharedLink.click()
  await nextTick()
  expect(checkbox("新增公告").getAttribute("aria-checked")).toBe("true")
  document.querySelector<HTMLButtonElement>('[data-dependency-resource="department"]')!.click()
  await nextTick()
  expect(checkbox("查看部门").getAttribute("aria-checked")).toBe("true")
  await navigateModule("通知管理")
  expect(checkbox("新增公告").getAttribute("aria-checked")).toBe("true")
})

it("does not report a cleared module as empty when another module still requires its write code", async () => {
  const catalog = {
    ...notificationCatalog,
    codes: [...notificationCatalog.codes, permissionCode("user:publish", ["notification:update"], "外部发布")],
  }
  await open({ modules: true, catalog, codes: ["user:publish", "notification:update"] })
  await navigateModule("通知管理")
  button(key("moduleClear")).click()
  await nextTick()
  expect(checkbox("编辑公告").getAttribute("aria-checked")).toBe("true")
  expect(document.body.textContent).toContain(key("dependencyStillEffective"))
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith("role", expect.objectContaining({ permissionCodes: ["user:publish"] })),
  )
})

it("reviews direct grants and cross-module dependencies under their owning modules", async () => {
  const system = menu("system", {
    menuName: "系统管理",
    menuType: "1",
    children: [
      menu("users", { permission: "user:options" }),
      menu("departments", { permission: "department:read" }),
      menu("roles", { permission: "role:options" }),
    ],
  })
  const catalog = {
    ...notificationCatalog,
    resources: notificationCatalog.resources.map((r) =>
      r.key === "user"
        ? {
            ...r,
            dataScopes: [{ key: "self", label: "本人" }],
            fieldGroups: [{ key: "contact", label: "联系方式", fields: ["phone"], modes: ["hidden" as const] }],
          }
        : r,
    ),
  }
  await open({
    modules: true,
    catalog,
    codes: ["user:options"],
    menuResults: [menuPage([...notificationMenus, system])],
  })
  const scope = document.querySelector<HTMLSelectElement>('select[aria-label="用户管理 / page.manage.role.dataScope"]')!
  scope.value = "all"
  scope.dispatchEvent(new Event("change"))
  await nextTick()
  await navigateModule("通知管理")
  checkbox("新增公告").click()
  await nextTick()
  button(key("review")).click()
  await nextTick()
  expect(document.querySelector('[data-review-module="notifications"]')?.textContent).toContain("新增公告")
  expect(document.querySelector('[data-review-module="system"]')?.textContent).toContain("查看部门")
  expect(document.querySelector('[data-review-module="system"]')?.textContent).toContain("用户管理")
  button(key("back")).click()
  await nextTick()
  expect(document.querySelector('[data-permission-module="notifications"]')).toBeTruthy()
  expect(checkbox("新增公告").getAttribute("aria-checked")).toBe("true")
  button(key("review")).click()
  await nextTick()
  button(key("save")).click()
  button(key("save")).click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledExactlyOnceWith("role", {
      permissionCodes: ["user:options", "notification:create"],
      dataScopes: {},
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

it("retains removed unknown codes in the grouped change review", async () => {
  await open({ modules: true, invalid: true })
  button(key("removeInvalid")).click()
  button(key("repairInvalid")).click()
  await nextTick()
  button(key("review")).click()
  await nextTick()
  expect(document.querySelector('[data-review-module="other"]')?.textContent).toContain("old:read")
  expect(document.body.textContent).toContain(key("repairSummary"))
})

it("exposes resource expansion as a keyboard-focusable button without changing grants", async () => {
  await open({ modules: true })
  await navigateModule("通知管理")
  const header = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === "模板管理",
  )
  expect(header).toBeTruthy()
  expect(header!.textContent).toContain("0/4")
  expect(header!.tabIndex).toBe(0)
  expect(header!.getAttribute("aria-expanded")).toBe("true")
  header!.click()
  await nextTick()
  expect(header!.getAttribute("aria-expanded")).toBe("false")
  header!.click()
  await nextTick()
  expect(header!.getAttribute("aria-expanded")).toBe("true")
  expect(button(key("review")).disabled).toBe(true)
  expect(api.save).not.toHaveBeenCalled()
})

// @vitest-environment jsdom
import { createApp, h, nextTick, reactive } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { NConfigProvider } from "naive-ui"
import { afterEach, expect, it, vi } from "vitest"
import PermissionModal from "@/views/manage/role/modules/permission-modal.vue"

const api = vi.hoisted(() => ({ catalog: vi.fn(), permissions: vi.fn(), packages: vi.fn(), save: vi.fn() }))
vi.mock("@/service/api", () => ({
  fetchGetPermissionCatalog: api.catalog,
  fetchGetRolePermissions: api.permissions,
  fetchGetAllPermissionPackages: api.packages,
  fetchUpdateRolePermissions: api.save,
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
async function open(options: { fail?: boolean; invalid?: boolean; codes?: string[] } = {}) {
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
  const result = {
    error: null,
    data: {
      permissionCodes: options.codes ?? ["user:read"],
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
  if (!options.fail) await vi.waitFor(() => expect(checkbox("User full")).toBeTruthy())
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

// @vitest-environment jsdom
import { createApp, h, reactive } from "vue"
import { NConfigProvider } from "naive-ui"
import { afterEach, expect, it, vi } from "vitest"
import PermissionModal from "@/views/manage/role/modules/permission-modal.vue"

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  permissions: vi.fn(),
  save: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchGetPermissionCatalog: api.catalog,
  fetchGetRolePermissions: api.permissions,
  fetchUpdateRolePermissions: api.save,
}))
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
})

async function open(fail: boolean) {
  api.catalog.mockResolvedValue({
    error: null,
    data: {
      resources: [
        {
          key: "user",
          label: "User",
          dataScopes: [{ key: "dept", label: "Dept" }],
          fieldGroups: [{ key: "contact", label: "Contact", fields: ["phone"], modes: ["masked", "hidden"] }],
        },
      ],
      codes: [
        { code: "user:read", resource: "user", label: "Read user", abacAction: "read", source: "code", depends: [] },
      ],
    },
  })
  api.permissions.mockResolvedValue(
    fail
      ? { error: new Error("unavailable"), data: null }
      : {
          error: null,
          data: {
            permissionCodes: ["user:read"],
            invalidCodes: [],
            dataScopes: { user: "dept" },
            fieldModes: { user: { contact: "masked" } },
            invalidScopes: [{ resource: "user", group: null, stored: "region", effective: "dept" }],
          },
        },
  )
  api.save.mockResolvedValue({ error: null })
  const state = reactive({ visible: false })
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
              roleId: "role",
              visible: state.visible,
              "onUpdate:visible": (value: boolean) => {
                state.visible = value
              },
            }),
        },
      ),
  })
  app.mount(host)
  state.visible = true
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalledWith("role"))
  return await vi.waitFor(() => {
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "common.confirm",
    )
    expect(confirm).toBeTruthy()
    return confirm!
  })
}

it("does not allow saving empty grants after a failed load", async () => {
  const confirm = await open(true)
  await vi.waitFor(() => expect(confirm.disabled).toBe(true))
  confirm.click()
  expect(api.save).not.toHaveBeenCalled()
})

it("saves loaded direct codes, data scopes and field modes", async () => {
  const confirm = await open(false)
  await vi.waitFor(() => expect(confirm.disabled).toBe(false))
  expect(document.body.textContent).toContain("page.manage.role.invalidScopes")
  confirm.click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledWith("role", {
      permissionCodes: ["user:read"],
      dataScopes: { user: "dept" },
      fieldModes: { user: { contact: "masked" } },
    }),
  )
})

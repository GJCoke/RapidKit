// @vitest-environment jsdom
import { createApp, h, reactive } from "vue"
import { NConfigProvider } from "naive-ui"
import { afterEach, expect, it, vi } from "vitest"
import ApplyPackageModal from "@/views/manage/role/modules/apply-package-modal.vue"
const api = vi.hoisted(() => ({
  packages: vi.fn(),
  permissions: vi.fn(),
  save: vi.fn(),
}))
vi.mock("@/service/api", () => ({
  fetchGetAllPermissionPackages: api.packages,
  fetchGetRolePermissions: api.permissions,
  fetchApplyPermissionPackages: api.save,
}))
vi.mock("naive-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("naive-ui")>()
  const { defineComponent, h } = await import("vue")
  return {
    ...actual,
    NSelect: defineComponent({
      props: ["value", "options", "disabled"],
      emits: ["update:value"],
      setup(props, { emit }) {
        return () =>
          h(
            "select",
            {
              disabled: props.disabled,
              multiple: true,
              onChange: (event: Event) =>
                emit(
                  "update:value",
                  [...(event.target as HTMLSelectElement).selectedOptions].map((o) => o.value),
                ),
            },
            props.options.map((o: { label: string; value: string }) => h("option", { value: o.value }, o.label)),
          )
      },
    }),
  }
})
vi.mock("@/hooks/business/auth", () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
let app: ReturnType<typeof createApp>
let host: HTMLDivElement
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
async function open(fail = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  api.packages.mockResolvedValue({
    error: null,
    data: [
      {
        key: "user.full",
        label: "User full",
        codes: ["user:read", "user:update"],
        dataScopes: {},
        fieldModes: {},
      },
    ],
  })
  api.permissions.mockResolvedValue(
    fail
      ? { error: new Error("failed") }
      : {
          error: null,
          data: {
            permissionCodes: ["role:read"],
            invalidCodes: ["obsolete:read"],
            invalidScopes: [],
            dataScopes: {},
            fieldModes: {},
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
            h(ApplyPackageModal, {
              roleId: "role",
              visible: state.visible,
              "onUpdate:visible": (v: boolean) => {
                state.visible = v
              },
            }),
        },
      ),
  })
  app.mount(host)
  state.visible = true
  await vi.waitFor(() => expect(api.permissions).toHaveBeenCalled())
  return await vi.waitFor(() => {
    const btn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "common.confirm",
    )
    expect(btn).toBeTruthy()
    return btn!
  })
}
it("disables both selection and submission when loading current grants fails", async () => {
  const confirm = await open(true)
  await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("select")?.disabled).toBe(true))
  expect(confirm.disabled).toBe(true)
  confirm.click()
  expect(api.save).not.toHaveBeenCalled()
})
it("previews merge and replacement, then submits exactly the chosen package once", async () => {
  const confirm = await open()
  const select = document.querySelector<HTMLSelectElement>("select")!
  await vi.waitFor(() => expect(select.options).toHaveLength(1))
  select.options[0]!.selected = true
  select.dispatchEvent(new Event("change"))
  await vi.waitFor(() => expect(confirm.disabled).toBe(false))
  expect(document.body.textContent).toContain("+ user:update")
  expect(document.body.textContent).not.toContain("− role:read")
  const radios = [...document.querySelectorAll<HTMLElement>(".n-radio")]
  radios[1]!.click()
  await vi.waitFor(() => expect(document.body.textContent).toContain("− role:read"))
  expect(document.body.textContent).toContain("− obsolete:read")
  confirm.click()
  confirm.click()
  await vi.waitFor(() =>
    expect(api.save).toHaveBeenCalledExactlyOnceWith("role", { packageKeys: ["user.full"], mode: "replace" }),
  )
})

// @vitest-environment jsdom
import { createApp, h, reactive } from "vue"
import { NConfigProvider } from "naive-ui"
import { afterEach, expect, it, vi } from "vitest"
import UserOperateDrawer from "@/views/manage/user/modules/user-operate-drawer.vue"

const api = vi.hoisted(() => ({ update: vi.fn(), roles: vi.fn(), departments: vi.fn(), validate: vi.fn() }))
vi.mock("@/service/api", () => ({
  fetchUpdateUser: api.update,
  fetchCreateUser: vi.fn(),
  fetchGetAllRoles: api.roles,
  fetchGetDepartmentTree: api.departments,
  fetchValidateUsernamePinyin: api.validate,
}))
vi.mock("@/store/modules/auth", () => ({
  useAuthStore: () => ({
    isLogin: true,
    userInfo: {
      id: "editor",
      buttons: ["user:update"],
      isAdmin: false,
      restrictedFields: { user: { email: "hidden", phone: "masked" } },
    },
  }),
}))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it.each([undefined, "z***@example.com"])("saves an unrelated edit when restricted email is %s", async (email) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  api.roles.mockResolvedValue({ error: null, data: [] })
  api.departments.mockResolvedValue({ error: null, data: [] })
  api.validate.mockResolvedValue({ error: null, data: { suggestedUsername: "guest", consistent: true } })
  api.update.mockResolvedValue({ error: null })
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
            h(UserOperateDrawer, {
              operateType: "edit",
              rowData: {
                id: "user-id",
                name: "Guest",
                username: "guest",
                email,
                phone: "138****8000",
                status: "1",
                roles: [],
              } as unknown as Api.SystemManage.User,
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
  const emailInput = await vi.waitFor(() => {
    const item = [...document.querySelectorAll(".n-form-item")].find((element) =>
      element.textContent?.includes("page.manage.user.userEmail"),
    )
    const input = item?.querySelector<HTMLInputElement>("input")
    expect(input).toBeTruthy()
    return input!
  })
  expect(emailInput.disabled).toBe(true)
  const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "common.confirm",
  )!
  confirm.click()
  await vi.waitFor(() => expect(api.update).toHaveBeenCalledOnce())
  expect(api.update.mock.calls[0]![0]).toBe("user-id")
  expect(api.update.mock.calls[0]![1]).not.toHaveProperty("email")
  expect(api.update.mock.calls[0]![1]).not.toHaveProperty("phone")
  expect(api.update.mock.calls[0]![1]).toMatchObject({ name: "Guest", username: "guest" })
})

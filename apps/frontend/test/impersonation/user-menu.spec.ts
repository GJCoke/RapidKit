// @vitest-environment jsdom
import { createApp, h, nextTick, reactive, ref } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import UserMenu from "../../src/layouts/modules/global-header/components/user-menu.vue"

const fixture = vi.hoisted(() => ({
  auth: null as any,
  theme: null as any,
  stop: vi.fn(),
  reset: vi.fn(),
  dialog: vi.fn(),
}))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => fixture.auth }))
vi.mock("@/store/modules/app", () => ({ useAppStore: () => ({ locale: "zh-CN" }) }))
vi.mock("@/hooks/common/router", () => ({ useRouterPush: () => ({ routerPushByKey: vi.fn(), toLogin: vi.fn() }) }))
vi.mock("@/hooks/common/icon", () => ({ useSvgIcon: () => ({ SvgIconVNode: () => () => h("i") }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("@/components/common/app-avatar.vue", () => ({
  default: { props: ["name"], setup: (props: any) => () => h("span", { class: "avatar" }, props.name) },
}))
vi.mock("naive-ui", () => ({
  useThemeVars: () => fixture.theme,
  NButton: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h("button", slots.default?.()),
  },
  NTooltip: {
    props: ["placement"],
    setup:
      (_: any, { slots }: any) =>
      () =>
        slots.trigger?.(),
  },
  NDropdown: {
    props: ["show", "options"],
    emits: ["update:show", "select"],
    setup:
      (props: any, { slots, emit }: any) =>
      () =>
        h("div", [
          h("div", { onClick: () => emit("update:show", !props.show) }, slots.default?.()),
          props.show
            ? h(
                "div",
                { role: "menu" },
                props.options.map((option: any) =>
                  option.type === "render"
                    ? option.render()
                    : option.type === "divider"
                      ? h("hr")
                      : h("button", { onClick: () => emit("select", option.key) }, option.label),
                ),
              )
            : null,
        ]),
  },
}))

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  fixture.stop.mockResolvedValue(undefined)
  fixture.theme = ref({ hoverColor: "rgb(243, 243, 245)" })
  fixture.auth = reactive({
    isLogin: true,
    userInfo: { id: "subject", name: "张三", username: "zhangsan", email: "user@example.test", avatar: null },
    impersonation: {
      sessionId: "session",
      subject: { id: "subject", name: "张三", username: "zhangsan" },
      expiresAt: "2026-10-16T06:30:00Z",
    },
    expiresInSeconds: 61,
    stopImpersonation: fixture.stop,
    resetStore: fixture.reset,
  })
  window.$dialog = { info: fixture.dialog } as any
  host = document.createElement("div")
  document.body.append(host)
})
afterEach(() => {
  app?.unmount()
  host.remove()
  app = undefined
})

function mount() {
  app = createApp(UserMenu)
  app.component("SvgIcon", { setup: () => () => h("i") })
  app.mount(host)
}
function avatar() {
  return host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
}
function exit() {
  return host.querySelector<HTMLButtonElement>('button[aria-label="page.manage.user.impersonation.stop"]')
}

it("keeps ordinary account logout and omits the impersonation exit icon", async () => {
  fixture.auth.impersonation = null
  mount()
  expect(exit()).toBeNull()
  avatar().click()
  await nextTick()
  const logout = [...host.querySelectorAll("button")].find((el) => el.textContent === "common.logout")!
  logout.click()
  expect(fixture.dialog).toHaveBeenCalledTimes(1)
  expect(fixture.stop).not.toHaveBeenCalled()
})

it("keeps all impersonation text in the avatar dropdown", async () => {
  mount()
  expect(exit()).not.toBeNull()
  expect(host.querySelector('[role="menu"]')).toBeNull()
  expect(host.textContent).not.toContain("impersonation.remaining")
  expect(host.textContent).not.toContain("impersonation.active")
  avatar().click()
  await nextTick()
  const menu = host.querySelector('[role="menu"]')!
  expect(menu.textContent).toContain("@zhangsan")
  expect(menu.textContent).toContain("impersonation.active")
  expect(menu.textContent).toContain("01:01")
  expect(menu.textContent).toContain("impersonation.expiresAt")
  expect(menu.textContent).toContain("impersonation.restoreHint")
  expect(menu.textContent).toContain("impersonation.auditHint")
  expect(menu.textContent).not.toContain("common.logout")
  fixture.auth.expiresInSeconds = 45
  await nextTick()
  expect(menu.textContent).toContain("00:45")
})

it("stops with one icon click, no confirmation, and blocks duplicate requests while restoring", async () => {
  let resolve!: () => void
  fixture.stop.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  mount()
  const button = exit()!
  expect(button).not.toBeNull()
  button.click()
  button.click()
  await nextTick()
  expect(fixture.stop).toHaveBeenCalledTimes(1)
  expect(fixture.dialog).not.toHaveBeenCalled()
  expect(button.disabled).toBe(true)
  resolve()
  await fixture.stop.mock.results[0].value
  await nextTick()
  expect(button.disabled).toBe(false)
  fixture.auth.impersonation = null
  await nextTick()
  expect(exit()).toBeNull()
})

it("replaces an open simulation menu with normal logout when the session ends", async () => {
  mount()
  avatar().click()
  await nextTick()
  expect(host.textContent).toContain("impersonation.active")
  fixture.auth.impersonation = null
  await nextTick()
  expect(exit()).toBeNull()
  expect(host.textContent).not.toContain("impersonation.active")
  expect(host.textContent).toContain("common.logout")
})

it("provides the capsule fill locally and updates it when the theme changes", async () => {
  mount()
  const capsule = exit()!.closest<HTMLElement>(".bg-theme-fill")!
  expect(capsule).not.toBeNull()
  expect(capsule.style.getPropertyValue("--fill-color")).toBe("rgb(243, 243, 245)")
  fixture.theme.value.hoverColor = "rgb(55, 55, 59)"
  await nextTick()
  expect(capsule.style.getPropertyValue("--fill-color")).toBe("rgb(55, 55, 59)")
  fixture.auth.impersonation = null
  await nextTick()
  expect(capsule.classList.contains("bg-theme-fill")).toBe(false)
  expect(capsule.style.getPropertyValue("--fill-color")).toBe("")
})

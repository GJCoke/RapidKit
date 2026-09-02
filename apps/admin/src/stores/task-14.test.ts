import assert from "node:assert/strict"
import test from "node:test"

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })

test("theme toggle cycles light, dark, auto, then light", async () => {
  const { useThemeStore } = await import("./theme")
  useThemeStore.setState({ colorScheme: "light" })

  useThemeStore.getState().toggleScheme()
  assert.equal(useThemeStore.getState().colorScheme, "dark")
  useThemeStore.getState().toggleScheme()
  assert.equal(useThemeStore.getState().colorScheme, "auto")
  useThemeStore.getState().toggleScheme()
  assert.equal(useThemeStore.getState().colorScheme, "light")
  assert.equal(JSON.parse(storage.getItem("admin-theme") ?? "{}").state.colorScheme, "light")
})

test("mobile navigation open state can be controlled independently", async () => {
  const { useAppStore } = await import("./app")
  useAppStore.setState({ isMobile: true, siderCollapse: false, mobileNavOpen: false })

  useAppStore.getState().setMobileNavOpen(true)
  assert.equal(useAppStore.getState().mobileNavOpen, true)
  assert.equal(useAppStore.getState().siderCollapse, false)
  useAppStore.getState().setMobileNavOpen(false)
  assert.equal(useAppStore.getState().mobileNavOpen, false)
})

test("clearing auth also removes route data from the signed-out session", async () => {
  const [{ useAuthStore }, { useRouteStore }] = await Promise.all([import("./auth"), import("./route")])
  const menu = { key: "users", path: "/users", title: "Users", order: 0, hideInMenu: false }
  useRouteStore.setState({ menus: [menu], flat: { "/users": menu } })
  useAuthStore.setState({
    token: "access-token",
    refreshToken: "refresh-token",
    userInfo: {
      id: "1",
      createTime: "2026-09-02 00:00:00",
      updateTime: "2026-09-02 00:00:00",
      name: "Admin",
      email: "admin@example.com",
      username: "admin",
      isAdmin: true,
      roles: ["admin"],
      buttons: [],
    },
  })
  storage.setItem("accessToken", "access-token")
  storage.setItem("refreshToken", "refresh-token")

  useAuthStore.getState().clearAuth()

  assert.equal(useAuthStore.getState().token, "")
  assert.equal(storage.getItem("accessToken"), null)
  assert.deepEqual(useRouteStore.getState().menus, [])
  assert.deepEqual(useRouteStore.getState().flat, {})
})

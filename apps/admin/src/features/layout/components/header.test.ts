import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { MenuItem } from "@/stores/route"

const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })

const system: MenuItem = {
  key: "system",
  path: "/system",
  title: "System",
  order: 0,
  hideInMenu: false,
}
const users: MenuItem = {
  key: "users",
  path: "/system/users",
  title: "Users",
  order: 0,
  hideInMenu: false,
}

test("breadcrumb trail follows matching pathname prefixes in order", async () => {
  const { buildBreadcrumbTrail } = await import("./breadcrumbs")
  const flat = { "/system": system, "/system/users": users }

  assert.deepEqual(buildBreadcrumbTrail("/system/users", flat), [system, users])
  assert.deepEqual(buildBreadcrumbTrail("/unknown", flat), [])
})

test("user identity follows the backend name, username, email contract", async () => {
  const { getUserDisplayName, getUserInitial } = await import("./user-menu")
  const namedUser = { name: "Alice", username: "admin", email: "alice@example.com" }
  const usernameOnly = { name: "", username: "admin", email: "admin@example.com" }

  assert.equal(getUserDisplayName(namedUser, "User"), "Alice")
  assert.equal(getUserInitial(namedUser), "A")
  assert.equal(getUserDisplayName(usernameOnly, "User"), "admin")
  assert.equal(getUserInitial(usernameOnly), "A")
  assert.equal(getUserDisplayName(null, "User"), "User")
  assert.equal(getUserInitial(null), "U")
})

test("mobile navigation close restores focus to its trigger", async () => {
  const { handleMobileNavigationCloseAutoFocus } = await import("./mobile-nav")
  const events: string[] = []

  handleMobileNavigationCloseAutoFocus(
    { preventDefault: () => events.push("prevent-default") },
    { focus: () => events.push("focus-trigger") },
  )

  assert.deepEqual(events, ["prevent-default", "focus-trigger"])
})

test("PageHeader keeps a block description out of paragraph markup", async () => {
  const { PageHeader } = await import("./page-header")
  const markup = renderToStaticMarkup(
    createElement(PageHeader, {
      title: "Dashboard",
      description: createElement("div", null, "Live status"),
    }),
  )

  assert.doesNotMatch(markup, /<p[^>]*><div/)
  assert.match(markup, /<div class="mt-1 text-sm text-muted-foreground"><div>Live status<\/div><\/div>/)
})

test("PageHeader continues to render a text description", async () => {
  const { PageHeader } = await import("./page-header")
  const markup = renderToStaticMarkup(createElement(PageHeader, { title: "Dashboard", description: "Overview" }))

  assert.match(markup, />Overview<\/div>/)
})

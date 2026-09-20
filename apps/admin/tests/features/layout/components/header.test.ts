import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })

test("user identity follows the backend name, username, email contract", async () => {
  const { getUserDisplayName, getUserInitial } = await import("@/features/layout/components/user-menu")
  const namedUser = { name: "Alice", username: "admin", email: "alice@example.com" }
  const usernameOnly = { name: "", username: "admin", email: "admin@example.com" }

  assert.equal(getUserDisplayName(namedUser, "User"), "Alice")
  assert.equal(getUserInitial(namedUser), "A")
  assert.equal(getUserDisplayName(usernameOnly, "User"), "admin")
  assert.equal(getUserInitial(usernameOnly), "A")
  assert.equal(getUserDisplayName(null, "User"), "User")
  assert.equal(getUserInitial(null), "U")
})

test("the Base UI user menu keeps its label inside a menu group", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/user-menu.tsx", import.meta.url), "utf8")

  assert.match(
    source,
    /<DropdownMenuGroup>\s*<DropdownMenuLabel>[\s\S]*<\/DropdownMenuLabel>[\s\S]*<\/DropdownMenuGroup>/,
  )
})

test("mobile navigation delegates focus restoration to Base UI", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/mobile-nav.tsx", import.meta.url), "utf8")

  assert.match(source, /finalFocus=\{triggerRef\}/)
  assert.doesNotMatch(source, /onCloseAutoFocus|asChild/)
})

test("PageHeader keeps a block description out of paragraph markup", async () => {
  const { PageHeader } = await import("@/features/layout/components/page-header")
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
  const { PageHeader } = await import("@/features/layout/components/page-header")
  const markup = renderToStaticMarkup(createElement(PageHeader, { title: "Dashboard", description: "Overview" }))

  assert.match(markup, />Overview<\/div>/)
})

test("sidebar toggle icon points toward the next sidebar state", async () => {
  const { getSidebarToggleIcon } = await import("@/features/layout/components/header")

  assert.equal(getSidebarToggleIcon(false), "collapse")
  assert.equal(getSidebarToggleIcon(true), "expand")
}, 15_000)

test("header always exposes the developer theme workbench", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/header-tools.tsx", import.meta.url), "utf8")
  assert.match(source, /<ThemeWorkbenchTrigger key=\{tool\} \/>/)
})

test("header exposes the global route search trigger", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/header-tools.tsx", import.meta.url), "utf8")
  assert.match(source, /<GlobalSearch key=\{tool\} \/>/)
})

test("header tool composition keeps compact-only controls inside the overflow menu", async () => {
  const { getHeaderToolsLayout } = await import("@/features/layout/components/header-tools")

  assert.deepEqual(getHeaderToolsLayout(false), {
    direct: ["search", "browserFullscreen", "locale", "themeWorkbench", "theme", "user"],
    overflow: [],
  })
  assert.deepEqual(getHeaderToolsLayout(true), {
    direct: ["search", "theme", "user"],
    overflow: ["browserFullscreen", "locale", "themeWorkbench"],
  })
})

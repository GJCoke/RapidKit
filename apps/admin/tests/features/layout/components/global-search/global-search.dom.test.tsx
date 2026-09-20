// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import i18n from "@/locales"
import { normalizeRoutes, EMPTY_ROUTE_SNAPSHOT } from "@/features/router/route-model"
import { useRouteStore } from "@/stores/route"
import { renderAdmin } from "@test/setup/render"
import { GlobalSearch } from "@/features/layout/components/global-search/global-search"

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverStub })
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined })

const snapshot = normalizeRoutes([
  {
    name: "system",
    path: "/system",
    component: "layout.base",
    meta: { title: "System", order: 0 },
    children: [
      { name: "users", path: "users", component: "view.users", meta: { title: "Users", order: 0 } },
      { name: "audit", path: "audit", component: "view.audit", meta: { title: "Audit log", order: 1 } },
      { name: "hidden", path: "hidden", component: "view.hidden", meta: { title: "Hidden page", hideInMenu: true } },
      {
        name: "docs",
        path: "docs",
        component: "view.docs",
        meta: { title: "Documentation", href: "https://example.com" },
      },
    ],
  },
])

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

beforeEach(async () => {
  await i18n.changeLanguage("en-US")
  useRouteStore.setState({ revision: 1, homeName: "", snapshot, menus: [], flat: {} })
})

afterEach(() => {
  snapshot.byName.audit!.hideInMenu = false
  useRouteStore.setState({ revision: 0, homeName: "", snapshot: EMPTY_ROUTE_SNAPSHOT, menus: [], flat: {} })
})

test("opens from its button and the Ctrl/Cmd+K shortcut", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await user.click(screen.getByRole("button", { name: "Search pages" }))
  expect(screen.getByRole("dialog", { name: "Search pages" })).toBeInTheDocument()

  await user.keyboard("{Escape}")
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

  await user.keyboard("{Control>}k{/Control}")
  expect(screen.getByRole("dialog", { name: "Search pages" })).toBeInTheDocument()
})

test("opens from the Cmd+K shortcut", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await user.keyboard("{Meta>}k{/Meta}")

  expect(screen.getByRole("dialog", { name: "Search pages" })).toBeInTheDocument()
})

test("only lists searchable routes and clears an unmatched keyword after closing", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await user.click(screen.getByRole("button", { name: "Search pages" }))
  expect(screen.getByRole("option", { name: "Users" })).toBeInTheDocument()
  expect(screen.getByRole("option", { name: "Audit log" })).toBeInTheDocument()
  expect(screen.queryByRole("option", { name: "Hidden page" })).not.toBeInTheDocument()
  expect(screen.queryByRole("option", { name: "Documentation" })).not.toBeInTheDocument()

  const input = screen.getByPlaceholderText("Search pages")
  await user.type(input, "missing")
  expect(await screen.findByText("No pages found")).toBeInTheDocument()

  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: "Search pages" }))
  expect(screen.getByPlaceholderText("Search pages")).toHaveValue("")
  expect(screen.getByRole("option", { name: "Users" })).toBeInTheDocument()
})

test("wraps keyboard selection and navigates to the selected route on Enter", async () => {
  const user = userEvent.setup()
  renderAdmin(
    <>
      <GlobalSearch />
      <LocationProbe />
    </>,
    { initialEntries: ["/system/users"] },
  )

  await user.click(screen.getByRole("button", { name: "Search pages" }))
  await user.keyboard("{ArrowUp}{Enter}")

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByTestId("location")).toHaveTextContent("/system/audit")
})

test("wraps ArrowDown selection to the first route", async () => {
  const user = userEvent.setup()
  renderAdmin(
    <>
      <GlobalSearch />
      <LocationProbe />
    </>,
    { initialEntries: ["/system/audit"] },
  )

  await user.click(screen.getByRole("button", { name: "Search pages" }))
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")

  expect(screen.getByTestId("location")).toHaveTextContent("/system/users")
})

test("rebuilds the index when the route-store revision changes without replacing the snapshot", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await user.click(screen.getByRole("button", { name: "Search pages" }))
  expect(screen.getByRole("option", { name: "Audit log" })).toBeInTheDocument()

  snapshot.byName.audit!.hideInMenu = true
  useRouteStore.setState({ revision: 2, snapshot })

  await waitFor(() => expect(screen.queryByRole("option", { name: "Audit log" })).not.toBeInTheDocument())
})

test("updates search labels after a locale switch", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await i18n.changeLanguage("zh-CN")

  await waitFor(() => expect(screen.getByRole("button", { name: "搜索页面" })).toBeInTheDocument())
  await user.click(screen.getByRole("button", { name: "搜索页面" }))
  expect(screen.getByRole("dialog", { name: "搜索页面" })).toBeInTheDocument()
})

test("uses the available mobile viewport and restores a bounded desktop dialog", async () => {
  const user = userEvent.setup()
  renderAdmin(<GlobalSearch />)

  await user.click(screen.getByRole("button", { name: "Search pages" }))

  expect(screen.getByRole("dialog")).toHaveClass("inset-2", "h-[calc(100dvh-1rem)]", "sm:max-w-xl")
  expect(document.querySelector("[data-slot=command-list]")).toHaveClass("flex-1", "max-h-none", "sm:max-h-72")
})

test("removes the global keyboard listener after unmount", () => {
  const removeEventListener = vi.spyOn(window, "removeEventListener")
  const { unmount } = renderAdmin(<GlobalSearch />)

  unmount()

  expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function))
  removeEventListener.mockRestore()
})

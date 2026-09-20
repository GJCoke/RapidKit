// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, expect, test, vi } from "vitest"
import type { MenuItem } from "@/stores/route"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { renderAdmin } from "@test/setup/render"
import { HorizontalMenu } from "@/features/layout/components/menu/horizontal-menu"

const users: MenuItem = {
  key: "users",
  path: "/users",
  title: "Users",
  order: 0,
  hideInMenu: false,
}

const system: MenuItem = {
  key: "system",
  path: "",
  title: "System",
  order: 0,
  hideInMenu: false,
  children: [users],
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

afterEach(() => useThemeWorkbenchStore.getState().resetDraft())

test("first-level header items select their branch without opening a dropdown", async () => {
  const user = userEvent.setup()
  const onSelectBranch = vi.fn(() => system)

  renderAdmin(
    <HorizontalMenu menus={[system]} selectedPath={[]} onSelectBranch={onSelectBranch} branchBehavior="select" />,
  )

  const item = screen.getByRole("button", { name: "System" })
  expect(item).not.toHaveAttribute("data-slot", "dropdown-menu-trigger")

  await user.click(item)

  expect(onSelectBranch).toHaveBeenCalledOnce()
  expect(onSelectBranch).toHaveBeenCalledWith("system")
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
})

test("hierarchical header items keep dropdown behavior by default", () => {
  renderAdmin(<HorizontalMenu menus={[system]} selectedPath={[]} />)

  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("data-slot", "dropdown-menu-trigger")
})

test("exposes the main navigation label in the active locale", () => {
  renderAdmin(<HorizontalMenu menus={[]} selectedPath={[]} />)

  expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument()
})

test("auto-selecting a header branch opens its first navigable descendant", async () => {
  const user = userEvent.setup()
  useThemeWorkbenchStore.getState().updateSidebar({ autoSelectFirstMenu: true })

  renderAdmin(
    <>
      <HorizontalMenu menus={[system]} selectedPath={[]} onSelectBranch={vi.fn(() => system)} />
      <LocationProbe />
    </>,
  )

  await user.click(screen.getByRole("button", { name: "System" }))

  expect(screen.getByTestId("location")).toHaveTextContent("/users")
})

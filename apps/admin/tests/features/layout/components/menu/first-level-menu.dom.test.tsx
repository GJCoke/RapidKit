// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, expect, test, vi } from "vitest"
import type { MenuItem } from "@/stores/route"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { renderAdmin } from "@test/setup/render"
import { FirstLevelMenu } from "@/features/layout/components/menu/first-level-menu"

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

test("exposes the section navigation label in the active locale", () => {
  renderAdmin(<FirstLevelMenu menus={[]} activeKey={null} onSelect={vi.fn()} />)

  expect(screen.getByRole("navigation", { name: "分区导航" })).toBeInTheDocument()
})

test("auto-selecting a section branch opens its first navigable descendant", async () => {
  const user = userEvent.setup()
  useThemeWorkbenchStore.getState().updateSidebar({ autoSelectFirstMenu: true })

  renderAdmin(
    <>
      <FirstLevelMenu menus={[system]} activeKey={null} onSelect={vi.fn(() => system)} />
      <LocationProbe />
    </>,
  )

  await user.click(screen.getByRole("button", { name: "System" }))

  expect(screen.getByTestId("location")).toHaveTextContent("/users")
})

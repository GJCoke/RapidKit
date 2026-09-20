// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import { useRouteStore } from "@/stores/route"
import { MenuProvider, useLayoutMenu } from "@/features/layout/components/menu/menu-context"

const users: MenuItem = { key: "users", path: "/users", title: "Users", order: 0, hideInMenu: false }
const roles: MenuItem = { key: "roles", path: "/roles", title: "Roles", order: 0, hideInMenu: false }
const system: MenuItem = {
  key: "system",
  path: "",
  title: "System",
  order: 0,
  hideInMenu: false,
  children: [users, roles],
}

function Probe() {
  const menu = useLayoutMenu()
  return (
    <div>
      <output data-testid="first">{menu.activeFirstLevelKey}</output>
      <output data-testid="open">{String(menu.childPanelOpen)}</output>
      <button type="button" onClick={() => menu.selectFirstLevel("system")}>
        select
      </button>
      <button type="button" onClick={() => menu.setChildPanelOpen(true)}>
        open
      </button>
      <button type="button" onClick={menu.resetTransientSelection}>
        reset
      </button>
    </div>
  )
}

beforeEach(() => useRouteStore.setState({ menus: [system], flat: { "/users": users, "/roles": roles } }))

test("provides route-derived menu levels and resets transient panels", async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={["/users"]}>
      <MenuProvider layoutMode="vertical-mix">
        <Probe />
      </MenuProvider>
    </MemoryRouter>,
  )

  expect(screen.getByTestId("first")).toHaveTextContent("system")
  await user.click(screen.getByRole("button", { name: "open" }))
  expect(screen.getByTestId("open")).toHaveTextContent("true")
  await user.click(screen.getByRole("button", { name: "reset" }))
  expect(screen.getByTestId("open")).toHaveTextContent("false")
})

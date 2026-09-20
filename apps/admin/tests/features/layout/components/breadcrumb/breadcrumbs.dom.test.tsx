// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import { useRouteStore } from "@/stores/route"
import { Breadcrumbs } from "@/features/layout/components/breadcrumb/breadcrumbs"

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

const users: MenuItem = {
  key: "users",
  path: "/users",
  title: "Users",
  icon: "users",
  order: 0,
  hideInMenu: false,
}
const roles: MenuItem = {
  ...users,
  key: "roles",
  path: "/roles",
  title: "Roles",
  icon: "role",
}
const system: MenuItem = {
  key: "system",
  path: "",
  title: "System",
  localIcon: "settings",
  order: 0,
  hideInMenu: false,
  children: [users, roles],
}

describe("Breadcrumbs", () => {
  beforeEach(() => {
    useRouteStore.setState({ menus: [system], flat: { "/users": users, "/roles": roles } })
  })

  test("renders configured icons and marks only the last node as the current page", () => {
    render(
      <MemoryRouter initialEntries={["/users"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    )

    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument()
    expect(screen.getByText("Users").closest('[aria-current="page"]')).not.toBeNull()
    expect(document.querySelectorAll("[data-breadcrumb-icon]")).toHaveLength(2)
  })

  test("opens direct child options and navigates internally", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/users"]}>
        <Breadcrumbs />
        <LocationProbe />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole("button", { name: "System" }))
    await user.click(await screen.findByRole("menuitem", { name: "Roles" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/roles")
  })

  test("does not create a dropdown trigger for the current page", () => {
    render(
      <MemoryRouter initialEntries={["/users"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    )

    expect(screen.queryByRole("button", { name: "Users" })).not.toBeInTheDocument()
  })

  test("keeps dropdown triggers without a dropdown icon and separates levels with a slash", () => {
    render(
      <MemoryRouter initialEntries={["/users"]}>
        <Breadcrumbs />
      </MemoryRouter>,
    )

    const trigger = screen.getByRole("button", { name: "System" })
    expect(trigger.querySelectorAll("svg")).toHaveLength(1)
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]')
    expect(separator).toHaveTextContent("/")
    expect(separator?.querySelector("svg")).toBeNull()
  })
})

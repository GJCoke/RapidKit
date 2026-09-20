// @vitest-environment jsdom

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation, useNavigate } from "react-router"
import { afterEach, expect, test } from "vitest"
import type { MenuItem } from "@/stores/route"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { renderAdmin } from "@test/setup/render"
import { SidebarMenu } from "@/features/layout/components/sidebar-menu"
import { SidebarMenuProvider, useSidebarMenu } from "@/features/layout/components/sidebar/sidebar-menu-provider"

const system: MenuItem = {
  key: "system",
  path: "",
  title: "System",
  order: 0,
  hideInMenu: false,
  children: [
    {
      key: "users",
      path: "/users",
      title: "Users",
      order: 0,
      hideInMenu: false,
    },
  ],
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

afterEach(() => useThemeWorkbenchStore.getState().resetDraft())

test("auto-selecting a standard sidebar branch opens its first navigable descendant", async () => {
  const user = userEvent.setup()
  useThemeWorkbenchStore.getState().updateSidebar({ autoSelectFirstMenu: true })

  renderAdmin(
    <>
      <SidebarMenu menus={[system]} />
      <LocationProbe />
    </>,
  )

  await user.click(screen.getByRole("button", { name: "System" }))

  expect(screen.getByTestId("location")).toHaveTextContent("/users")
})

function ExpandedStateProbe() {
  const menu = useSidebarMenu()
  return (
    <>
      <button type="button" onClick={() => menu.setGroupExpanded("system", true)}>
        open system
      </button>
      <button type="button" onClick={() => menu.setGroupExpanded("reports", true)}>
        open reports
      </button>
      <output data-testid="system-expanded">{String(menu.isExpanded("system"))}</output>
      <output data-testid="reports-expanded">{String(menu.isExpanded("reports"))}</output>
    </>
  )
}

test("opening another top-level group preserves the first until a page is selected", async () => {
  const user = userEvent.setup()
  const reports: MenuItem = {
    key: "reports",
    path: "",
    title: "Reports",
    order: 1,
    hideInMenu: false,
    children: [{ key: "sales", path: "/sales", title: "Sales", order: 0, hideInMenu: false }],
  }

  renderAdmin(
    <SidebarMenuProvider collapsed={false} menus={[system, reports]}>
      <ExpandedStateProbe />
    </SidebarMenuProvider>,
  )

  await user.click(screen.getByRole("button", { name: "open system" }))
  await user.click(screen.getByRole("button", { name: "open reports" }))

  expect(screen.getByTestId("system-expanded")).toHaveTextContent("true")
  expect(screen.getByTestId("reports-expanded")).toHaveTextContent("true")
})

test("route changes never render children with the previous expanded path", async () => {
  const user = userEvent.setup()
  const users = system.children![0]!
  const reports: MenuItem = {
    key: "reports",
    path: "",
    title: "Reports",
    order: 1,
    hideInMenu: false,
    children: [{ key: "sales", path: "/sales", title: "Sales", order: 0, hideInMenu: false }],
  }
  const sales = reports.children![0]!
  const frames: string[] = []

  function RouteExpansionProbe() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const menu = useSidebarMenu()
    frames.push(`${pathname}:${menu.isExpanded("system")}:${menu.isExpanded("reports")}`)
    return (
      <button type="button" onClick={() => navigate("/sales")}>
        go sales
      </button>
    )
  }

  function Harness() {
    const { pathname } = useLocation()
    return (
      <SidebarMenuProvider
        collapsed={false}
        menus={[system, reports]}
        currentRoute={pathname === "/users" ? users : sales}
      >
        <RouteExpansionProbe />
      </SidebarMenuProvider>
    )
  }

  renderAdmin(<Harness />, { initialEntries: ["/users"] })
  frames.length = 0
  await user.click(screen.getByRole("button", { name: "go sales" }))

  expect(frames.filter((frame) => frame.startsWith("/sales"))).toEqual(["/sales:false:true"])
})

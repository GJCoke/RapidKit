// @vitest-environment jsdom

import type { ReactNode } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation } from "react-router"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { defaultThemeConfig, type LayoutMode } from "@/features/theme/theme-config"
import { EMPTY_ROUTE_SNAPSHOT } from "@/features/router/route-model"
import type { MenuItem } from "@/stores/route"
import { useAppStore } from "@/stores/app"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { renderAdmin } from "@test/setup/render"
import { AdminLayout } from "@/features/layout/components/admin-layout"

vi.mock("@/features/router/route-effects", () => ({ RouteEffects: () => null }))
vi.mock("@/features/layout/components/route-transition", () => ({ RouteTransition: () => <div>page content</div> }))
vi.mock("@/features/layout/components/page-tabs", () => ({ PageTabs: () => <div>tabs</div> }))
vi.mock("@/features/layout/components/page-container", () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/features/layout/components/header", () => ({
  Header: ({ menu }: { menu?: ReactNode }) => <header>{menu}</header>,
}))
vi.mock("@/features/layout/components/use-mobile-watch", () => ({ useMobileWatch: () => undefined }))

const menus: MenuItem[] = [
  {
    key: "system",
    path: "/system",
    title: "System",
    order: 0,
    hideInMenu: false,
    children: [
      {
        key: "manage",
        path: "/system/manage",
        title: "Management",
        order: 0,
        hideInMenu: false,
        children: [
          { key: "dashboard", path: "/dashboard", title: "Dashboard", order: 0, hideInMenu: false },
          { key: "users", path: "/users", title: "Users", order: 1, hideInMenu: false },
        ],
      },
    ],
  },
]

const flat = {
  "/system": menus[0],
  "/system/manage": menus[0].children![0],
  "/dashboard": menus[0].children![0].children![0],
  "/users": menus[0].children![0].children![1],
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

beforeEach(() => {
  useTabStore.getState().setPersistenceEnabled(true)
  useTabStore.setState({ tabs: [], activeKey: "" })
  window.localStorage.clear()
})

afterEach(() => {
  useThemeWorkbenchStore.getState().resetDraft()
  useRouteStore.setState({ revision: 0, homeName: "", snapshot: EMPTY_ROUTE_SNAPSHOT, menus: [], flat: {} })
  useAppStore.setState({
    siderCollapse: false,
    desktopSiderCollapse: false,
    hasUserSetSiderCollapse: false,
    isMobile: false,
    mixSiderFixed: false,
    fullContent: false,
  })
})

test("disables tab persistence even when the tab strip is hidden", () => {
  useThemeWorkbenchStore.setState({
    draft: {
      ...structuredClone(defaultThemeConfig),
      layout: { ...defaultThemeConfig.layout, showTabs: false },
      experience: { ...defaultThemeConfig.experience, restoreTabs: false },
    },
    previewActive: true,
  })

  renderAdmin(<AdminLayout />, { initialEntries: ["/users"] })
  useTabStore.getState().setActiveKey("later-mutation")

  expect(screen.queryByText("tabs")).not.toBeInTheDocument()
  expect(window.localStorage.getItem("admin-tabs")).toBeNull()
})

test.each([
  ["vertical", "System"],
  ["vertical-mix", "System"],
  ["vertical-hybrid-header-first", "System"],
  ["horizontal", "System"],
  ["top-hybrid-sidebar-first", "Management"],
  ["top-hybrid-header-first", "System"],
] as const)("%s auto-selects its rendered branch to the first navigable descendant", async (mode, branchLabel) => {
  const user = userEvent.setup()
  useRouteStore.setState({ revision: 1, homeName: "", snapshot: EMPTY_ROUTE_SNAPSHOT, menus, flat })
  useThemeWorkbenchStore.getState().updateLayout({ mode: mode as LayoutMode })
  useThemeWorkbenchStore.getState().updateSidebar({ autoSelectFirstMenu: true })

  renderAdmin(
    <>
      <AdminLayout />
      <LocationProbe />
    </>,
    { initialEntries: ["/users"] },
  )

  await user.click(screen.getByRole("button", { name: branchLabel }))

  expect(screen.getByTestId("location")).toHaveTextContent("/dashboard")
})

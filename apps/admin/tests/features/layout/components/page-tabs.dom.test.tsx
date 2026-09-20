// @vitest-environment jsdom

import { useQuery } from "@tanstack/react-query"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { getRouteInstanceKey } from "@/features/router/route-instance-key"
import { normalizeRoutes } from "@/features/router/route-model"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { RouteCacheHost } from "@/features/router/route-cache"
import { useAppStore } from "@/stores/app"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { renderAdmin } from "@test/setup/render"
import { PageTabs } from "@/features/layout/components/page-tabs"
import { applyRouteRefresh } from "@/features/layout/components/route-transition"

const snapshot = normalizeRoutes([{ name: "users", path: "/users", component: "view.users", meta: { title: "Users" } }])
const users = snapshot.byName.users!
const usersKey = getRouteInstanceKey(users, "/users")
const tabOperationSnapshot = normalizeRoutes([
  { name: "home", path: "/home", component: "view.home", meta: { title: "Home", fixedIndexInTab: -1 } },
  { name: "reports", path: "/reports", component: "view.reports", meta: { title: "Reports", fixedIndexInTab: 1 } },
  { name: "users", path: "/users", component: "view.users", meta: { title: "Users" } },
  { name: "roles", path: "/roles", component: "view.roles", meta: { title: "Roles" } },
  { name: "audit", path: "/audit", component: "view.audit", meta: { title: "Audit" } },
])

function setTabsForContextualClose() {
  useRouteStore.setState({ snapshot: tabOperationSnapshot })
  useTabStore.setState({
    tabs: [
      { key: "route:home", routeName: "home", label: "Home", path: "/home", fixedIndex: -1, closable: false },
      {
        key: "route:reports",
        routeName: "reports",
        label: "Reports",
        path: "/reports",
        fixedIndex: 1,
        closable: false,
      },
      { key: "route:users", routeName: "users", label: "Users", path: "/users", pinned: true, closable: true },
      { key: "route:roles", routeName: "roles", label: "Roles", path: "/roles", closable: true },
      { key: "route:audit", routeName: "audit", label: "Audit", path: "/audit", closable: true },
    ],
    activeKey: "route:audit",
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  useTabStore.getState().setPersistenceEnabled(true)
  window.localStorage.clear()
  useRouteStore.setState({ snapshot })
  useTabStore.setState({ tabs: [], activeKey: "" })
  useRouteCacheStore.setState({ entries: {}, activeKey: null, refreshGenerations: {} })
  useAppStore.setState({ fullContent: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test("renders fixed refresh and content-fullscreen tools", () => {
  renderAdmin(<PageTabs />, { initialEntries: ["/users"] })

  expect(screen.getByRole("button", { name: "刷新当前页面" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "全屏显示内容" })).toBeInTheDocument()
  expect(screen.getByTestId("page-tabs-scroller")).toHaveClass("min-w-0", "flex-1", "overflow-x-auto")
  expect(screen.getByTestId("page-tabs-tools")).toHaveClass("shrink-0")
})

test("keeps page tabs pointer-only while scrolling the active tab into view", () => {
  setTabsForContextualClose()
  const scrollIntoView = vi.fn()
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView })

  try {
    renderAdmin(<PageTabs />, { initialEntries: ["/audit"] })

    const audit = screen.getByText("Audit").closest("[data-testid='chrome-page-tab']") as HTMLDivElement
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(audit).not.toHaveAttribute("tabindex")
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" })

    fireEvent.keyDown(audit, { key: "ArrowLeft" })
    fireEvent.keyDown(audit, { key: "Enter" })
    expect(useTabStore.getState().activeKey).toBe("route:audit")
    expect(screen.getByRole("button", { name: "刷新当前页面" }).tabIndex).toBe(0)
    expect(screen.getByRole("button", { name: "全屏显示内容" }).tabIndex).toBe(0)
  } finally {
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
})

test("queues only the current route and guards repeated clicks while refreshing", () => {
  renderAdmin(<PageTabs />, { initialEntries: ["/users"] })
  const refresh = screen.getByRole("button", { name: "刷新当前页面" })

  fireEvent.click(refresh)
  fireEvent.click(refresh)

  expect(useRouteCacheStore.getState().pendingRefreshKey).toBe(usersKey)
  expect(useRouteCacheStore.getState().refreshGenerations).toEqual({})
  expect(refresh).toBeDisabled()
  expect(refresh.querySelector("svg")).toHaveClass("animate-spin")

  act(() => useRouteCacheStore.getState().completeRefresh())
  expect(refresh).toBeEnabled()
})

test("toggles content fullscreen and updates the accessible label", () => {
  renderAdmin(<PageTabs />, { initialEntries: ["/users"] })

  fireEvent.click(screen.getByRole("button", { name: "全屏显示内容" }))
  expect(useAppStore.getState().fullContent).toBe(true)
  expect(screen.getByRole("button", { name: "退出内容全屏" })).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "退出内容全屏" }))
  expect(useAppStore.getState().fullContent).toBe(false)
})

test("refresh marks fresh query data stale before remounting the current page", async () => {
  vi.useRealTimers()
  const queryFn = vi.fn(async () => ({ revision: queryFn.mock.calls.length }))

  function QueryPage() {
    const query = useQuery({ queryKey: ["refresh-probe"], queryFn, staleTime: Infinity })
    return <div>{query.data?.revision ?? "loading"}</div>
  }

  const { queryClient } = renderAdmin(
    <>
      <PageTabs />
      <RouteCacheHost route={users} pathSearch="/users">
        <QueryPage />
      </RouteCacheHost>
    </>,
    { initialEntries: ["/users"] },
  )

  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "刷新当前页面" }))
  act(() => {
    applyRouteRefresh(queryClient, usersKey)
    useRouteCacheStore.getState().completeRefresh()
  })
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
})

test("close-left evicts exactly the returned cache keys and retains protected tabs", async () => {
  vi.useRealTimers()
  setTabsForContextualClose()
  const evict = vi.spyOn(useRouteCacheStore.getState(), "evict")
  evict.mockClear()
  renderAdmin(<PageTabs />, { initialEntries: ["/audit"] })

  fireEvent.contextMenu(screen.getByText("Audit"), { clientX: 20, clientY: 20 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "关闭左侧" }))

  expect(evict).toHaveBeenCalledExactlyOnceWith(["route:roles"])
  expect(useTabStore.getState().tabs.map((tab) => tab.key)).toEqual([
    "route:home",
    "route:reports",
    "route:users",
    "route:audit",
  ])
})

test("close-right evicts exactly the returned cache keys and retains protected tabs", async () => {
  vi.useRealTimers()
  setTabsForContextualClose()
  const evict = vi.spyOn(useRouteCacheStore.getState(), "evict")
  evict.mockClear()
  renderAdmin(<PageTabs />, { initialEntries: ["/home"] })

  fireEvent.contextMenu(screen.getByText("Home"), { clientX: 20, clientY: 20 })
  expect(await screen.findByRole("menuitem", { name: "取消固定" })).toHaveAttribute("aria-disabled", "true")
  fireEvent.click(await screen.findByRole("menuitem", { name: "关闭右侧" }))

  expect(evict).toHaveBeenCalledExactlyOnceWith(["route:roles", "route:audit"])
  expect(useTabStore.getState().tabs.map((tab) => tab.key)).toEqual(["route:home", "route:reports", "route:users"])
})

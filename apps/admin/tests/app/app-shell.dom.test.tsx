// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { createMemoryRouter, RouterProvider, useLocation } from "react-router"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { TooltipProvider } from "@rapidkit/ui/components/tooltip"
import { LocaleSync } from "@/features/locale/locale-sync"
import { BrowserFullscreen, type FullscreenAdapter } from "@/features/layout/components/browser-fullscreen"
import { Header } from "@/features/layout/components/header"
import { LayoutShell } from "@/features/layout/components/layout-shell"
import { PageTabs } from "@/features/layout/components/page-tabs"
import { ThemeProvider } from "@/features/theme"
import { useEffectiveThemeConfig } from "@/features/theme/use-effective-theme"
import { RouteCacheHost } from "@/features/router/route-cache"
import { RouteEffects } from "@/features/router/route-effects"
import { findRouteForPath, normalizeRoutes } from "@/features/router/route-model"
import { createTestQueryClient } from "@test/setup/render"
import i18n from "@/locales"
import { useAppStore } from "@/stores/app"
import { useLocaleStore } from "@/stores/locale"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverStub })
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined })
Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] })

const snapshot = normalizeRoutes([
  {
    name: "home",
    path: "/home",
    component: "view.home",
    meta: { title: "首页", i18nKey: "route.home", fixedIndexInTab: -1 },
  },
  {
    name: "manage_user",
    path: "/manage/user",
    component: "view.users",
    meta: { title: "用户管理", i18nKey: "route.manage_user", keepAlive: true, multiTab: true },
  },
])
const shellCleanups: Array<() => void> = []
const initialDocumentState = { lang: document.documentElement.lang, title: document.title }

function createFullscreenHarness() {
  let fullscreenElement: Element | null = null
  let listener: (() => void) | undefined
  const adapter: FullscreenAdapter = {
    getElement: () => fullscreenElement,
    request: vi.fn(async (element: HTMLElement) => {
      fullscreenElement = element
      listener?.()
    }),
    exit: vi.fn(async () => {
      fullscreenElement = null
      listener?.()
    }),
    subscribe: (nextListener) => {
      listener = nextListener
      return () => {
        listener = undefined
      }
    },
  }

  return {
    adapter,
    setFullscreenElement: (element: Element | null) => {
      fullscreenElement = element
    },
    emitChange: () => listener?.(),
  }
}

function AppShell({ browserFullscreen }: { browserFullscreen?: FullscreenAdapter }) {
  const { pathname, search } = useLocation()
  const route = findRouteForPath(snapshot, pathname)
  const theme = useEffectiveThemeConfig()
  const fullContent = useAppStore((state) => state.fullContent)

  if (!route) return null

  return (
    <>
      <LocaleSync />
      <RouteEffects />
      <LayoutShell
        orientation="vertical"
        sidebar={<aside>Sidebar</aside>}
        sidebarWidth={220}
        scrollMode={theme.layout.scrollMode}
        fixedHeaderTabs={theme.layout.fixedHeaderTabs}
        fullContent={fullContent}
        header={
          <>
            <Header showSidebarToggle={false} showBreadcrumb={false} />
            {browserFullscreen ? (
              <BrowserFullscreen
                adapter={browserFullscreen}
                enterLabel="Enter browser fullscreen test"
                exitLabel="Exit browser fullscreen test"
              />
            ) : null}
          </>
        }
        tabs={<PageTabs />}
      >
        <RouteCacheHost route={route} pathSearch={`${pathname}${search}`}>
          <p>{route.title}</p>
        </RouteCacheHost>
      </LayoutShell>
    </>
  )
}

function renderShell(initialEntry = "/home", browserFullscreen?: FullscreenAdapter) {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter([{ path: "*", element: <AppShell browserFullscreen={browserFullscreen} /> }], {
    initialEntries: [initialEntry],
  })

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            <TooltipProvider delay={0}>{children}</TooltipProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
  }

  shellCleanups.push(() => {
    router.dispose()
    queryClient.clear()
  })

  return { router, ...render(<RouterProvider router={router} />, { wrapper: Providers }) }
}

beforeEach(async () => {
  useAppStore.setState({ fullContent: false, isMobile: false })
  useLocaleStore.setState({ locale: "zh-CN" })
  useRouteStore.setState({ revision: 1, homeName: "home", snapshot, menus: [], flat: {} })
  useTabStore.setState({ tabs: [], activeKey: "" })
  useRouteCacheStore.setState({ entries: {}, activeKey: null, refreshGenerations: {}, pendingRefreshKey: null })
  useThemeWorkbenchStore.getState().resetDraft()
  await i18n.changeLanguage("zh-CN")
})

afterEach(async () => {
  shellCleanups.splice(0).forEach((cleanup) => cleanup())
  useAppStore.setState({ fullContent: false, isMobile: false })
  useRouteStore.setState({ revision: 0, homeName: "", snapshot: normalizeRoutes([]), menus: [], flat: {} })
  useTabStore.setState({ tabs: [], activeKey: "" })
  useRouteCacheStore.setState({ entries: {}, activeKey: null, refreshGenerations: {}, pendingRefreshKey: null })
  useThemeWorkbenchStore.getState().resetDraft()
  useLocaleStore.setState({ locale: "zh-CN" })
  await i18n.changeLanguage("zh-CN")
  document.documentElement.lang = initialDocumentState.lang
  document.title = initialDocumentState.title
})

test("searching an authorized multi-tab route then switching language synchronizes the shell", async () => {
  const user = userEvent.setup()
  renderShell()

  await user.click(screen.getByRole("button", { name: "搜索页面" }))
  await user.click(screen.getByRole("option", { name: "用户管理" }))

  await waitFor(() => expect(within(screen.getByTestId("page-tabs-scroller")).getByText("用户管理")).toBeInTheDocument())
  expect(useTabStore.getState().activeKey).toBe("route:manage_user:/manage/user")
  expect(useRouteCacheStore.getState().entries).toHaveProperty("route:manage_user:/manage/user")

  await user.click(screen.getByRole("button", { name: "切换语言" }))
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "English" }))

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Search pages" })).toBeInTheDocument()
    expect(within(screen.getByTestId("page-tabs-scroller")).getByText("Users")).toBeInTheDocument()
    expect(document.title).toBe("Users - RapidKit Admin")
    expect(document.documentElement.lang).toBe("en-US")
  })
})

test("changing fixed header tabs changes the app shell scroll owner", async () => {
  renderShell()

  expect(screen.getByTestId("layout-scroll-owner")).toHaveAttribute("data-layout-scroll-owner", "content")

  useThemeWorkbenchStore.getState().updateLayout({ fixedHeaderTabs: false })

  await waitFor(() =>
    expect(screen.getByTestId("layout-scroll-owner")).toHaveAttribute("data-layout-scroll-owner", "page"),
  )
})

test("content fullscreen remains independently reversible after a browser fullscreen change", async () => {
  const user = userEvent.setup()
  const fullscreen = createFullscreenHarness()
  renderShell("/manage/user", fullscreen.adapter)

  await user.click(screen.getByRole("button", { name: "全屏显示内容" }))
  expect(useAppStore.getState().fullContent).toBe(true)

  fullscreen.setFullscreenElement(document.documentElement)
  fullscreen.emitChange()

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Exit browser fullscreen test", hidden: true })).toBeInTheDocument(),
  )
  expect(screen.getByRole("button", { name: "退出内容全屏" })).toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: "退出内容全屏" }))
  expect(useAppStore.getState().fullContent).toBe(false)
  expect(screen.getByRole("button", { name: "Exit browser fullscreen test" })).toBeInTheDocument()
})

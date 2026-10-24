// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { IframeRoute } from "@/features/router/iframe-route"
import { RouteCacheHost } from "@/features/router/route-cache"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { createTestQueryClient, renderAdmin } from "@test/setup/render"
import { ThemeProvider } from "@/features/theme"
import { TooltipProvider } from "@rapidkit/ui/components/tooltip"
import { I18nextProvider } from "react-i18next"
import { createMemoryRouter, RouterProvider, useLocation, useOutlet } from "react-router"
import userEvent from "@testing-library/user-event"
import { LocaleSync } from "@/features/locale/locale-sync"
import { useLocaleStore } from "@/stores/locale"
import { useThemeStore } from "@/stores/theme"
import { afterEach, expect, test } from "vitest"
import i18n from "@/locales"
import { constantRoutes } from "@/features/router/constants"
import { generateRoutes } from "@/features/router/generate-routes"
import { normalizeRoutes } from "@/features/router/route-model"
import { withBuiltinRoutes } from "@/features/router/builtin-routes"
import { useAuthStore } from "@/stores/auth"

afterEach(async () => {
  await i18n.changeLanguage("zh-CN")
  useLocaleStore.getState().setLocale("zh-CN")
  useThemeStore.getState().setColorScheme("light")
  useAuthStore.getState().clearAuth()
})
function show(routes: Parameters<typeof createMemoryRouter>[0], path: string, syncLocale = false) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          {syncLocale && <LocaleSync />}
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return router
}

test("generated builtin routes decode once, load a changed URL and translate the title without reloading", async () => {
  const source = "https://example.com/文档?path=%2Fkeep&word=a%20b#section"
  const routes = generateRoutes(normalizeRoutes(withBuiltinRoutes([])).tree)
  const router = show(routes, `/iframe-page/${encodeURIComponent(source)}`)
  const frame = await screen.findByTitle("嵌入页面")
  expect(frame).toHaveAttribute("src", new URL(source).href)
  fireEvent.load(frame)
  await act(async () => {
    await i18n.changeLanguage("en-US")
  })
  expect(screen.getByTitle("Embedded page")).toBe(frame)
  expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
  await act(async () => {
    await router.navigate(`/iframe-page/${encodeURIComponent("https://example.com/next")}`)
  })
  const next = screen.getByTitle("Embedded page")
  expect(next).not.toBe(frame)
  expect(next).toHaveAttribute("src", "https://example.com/next")
  expect(screen.getByText("Loading...")).toBeInTheDocument()
})

test("existing static iframe menu URLs still come from href", async () => {
  show(
    generateRoutes(
      normalizeRoutes([
        {
          name: "static",
          path: "/embed",
          component: "view._builtin_iframe-page",
          meta: { title: "Static frame", href: "https://example.com/static?path=%2Fkeep" },
        },
      ]).tree,
    ),
    "/embed",
  )
  expect(await screen.findByTitle("Static frame")).toHaveAttribute("src", "https://example.com/static?path=%2Fkeep")
})

test("the constant public iframe route works without an authenticated session", async () => {
  useAuthStore.getState().clearAuth()
  show(constantRoutes, `/iframe-page/${encodeURIComponent("https://example.com/public")}`)
  expect(await screen.findByTitle("嵌入页面")).toHaveAttribute("src", "https://example.com/public")
  expect(useAuthStore.getState().token).toBe("")
  expect(document.title).toBe(`${i18n.t("route.iframe-page")} - ${i18n.t("system.title")}`)
})

test("cached iframe URL tabs retain their own actual frame across switches", () => {
  useRouteCacheStore.getState().clear()
  const route = normalizeRoutes(withBuiltinRoutes([])).byName["iframe-page"]!
  const a = `/iframe-page/${encodeURIComponent("https://example.com/a")}`
  const b = `/iframe-page/${encodeURIComponent("https://example.com/b")}`
  const view = renderAdmin(
    <RouteCacheHost route={route} pathSearch={a}>
      <IframeRoute src="https://example.com/a" title="A" />
    </RouteCacheHost>,
  )
  const first = screen.getByTitle("A")
  fireEvent.load(first)
  view.rerender(
    <RouteCacheHost route={route} pathSearch={b}>
      <IframeRoute src="https://example.com/b" title="B" />
    </RouteCacheHost>,
  )
  const second = screen.getByTitle("B")
  fireEvent.load(second)
  expect(first.closest("[data-route-cache-key]")).toHaveAttribute("hidden")
  expect(second.closest("[data-route-cache-key]")).not.toHaveAttribute("hidden")
  view.rerender(
    <RouteCacheHost route={route} pathSearch={a}>
      <IframeRoute src="https://example.com/a" title="A" />
    </RouteCacheHost>,
  )
  expect(screen.getByTitle("A")).toBe(first)
  expect(screen.getByTitle("B")).toBe(second)
  expect(first.closest("[data-route-cache-key]")).not.toHaveAttribute("hidden")
  expect(second.closest("[data-route-cache-key]")).toHaveAttribute("hidden")
  expect(screen.queryByText("加载中...")).not.toBeInTheDocument()
})

test("inactive cached iframe outlets keep their own router location instead of following the current URL", async () => {
  useRouteCacheStore.getState().clear()
  const snapshot = normalizeRoutes(withBuiltinRoutes([]))
  const route = snapshot.byName["iframe-page"]!
  function CachedOutlet() {
    const location = useLocation()
    const outlet = useOutlet()
    return (
      <RouteCacheHost route={route} pathSearch={location.pathname + location.search}>
        {outlet}
      </RouteCacheHost>
    )
  }
  const aPath = `/iframe-page/${encodeURIComponent("https://example.com/a")}`
  const bPath = `/iframe-page/${encodeURIComponent("https://example.com/b")}`
  const router = show([{ path: "/", element: <CachedOutlet />, children: generateRoutes(snapshot.tree) }], aPath)
  const a = await screen.findByTitle("嵌入页面")
  fireEvent.load(a)
  await act(async () => {
    await router.navigate(bPath)
  })
  const frames = screen.getAllByTitle("嵌入页面")
  expect(frames.filter((frame) => frame.getAttribute("src") === "https://example.com/a")).toEqual([a])
  const b = frames.find((frame) => frame.getAttribute("src") === "https://example.com/b")
  expect(b).toBeDefined()
  expect(a.closest("[data-route-cache-key]")).toHaveAttribute("hidden")
  await act(async () => {
    await router.navigate(aPath)
  })
  expect(a).toHaveAttribute("src", "https://example.com/a")
  expect(a.closest("[data-route-cache-key]")).not.toHaveAttribute("hidden")
  expect(b?.closest("[data-route-cache-key]")).toHaveAttribute("hidden")
})

test("an outgoing iframe keeps its URL until navigation finishes and remains intact when cached", async () => {
  useRouteCacheStore.getState().clear()
  const snapshot = normalizeRoutes(withBuiltinRoutes([]))
  const route = snapshot.byName["iframe-page"]!
  const aPath = `/iframe-page/${encodeURIComponent("https://example.com/a")}`
  const bPath = `/iframe-page/${encodeURIComponent("https://example.com/b")}`
  let showingOutgoing = true
  function PendingOutlet() {
    const location = useLocation()
    const outlet = useOutlet()
    return (
      <RouteCacheHost route={route} pathSearch={showingOutgoing ? aPath : location.pathname + location.search}>
        {outlet}
      </RouteCacheHost>
    )
  }
  const router = show([{ path: "/", element: <PendingOutlet />, children: generateRoutes(snapshot.tree) }], aPath)
  const a = await screen.findByTitle("嵌入页面")
  fireEvent.load(a)
  await act(async () => {
    await router.navigate(bPath)
  })
  expect(screen.getByTitle("嵌入页面")).toBe(a)
  expect(a).toHaveAttribute("src", "https://example.com/a")
  showingOutgoing = false
  await act(async () => {
    await router.navigate(bPath)
  })
  expect(
    screen.getAllByTitle("嵌入页面").filter((frame) => frame.getAttribute("src") === "https://example.com/a"),
  ).toEqual([a])
  expect(a.closest("[data-route-cache-key]")).toHaveAttribute("hidden")
})

test("anonymous iframe controls change locale and theme without reloading content and can return to sign-in", async () => {
  useLocaleStore.getState().setLocale("zh-CN")
  useThemeStore.getState().setColorScheme("light")
  const user = userEvent.setup()
  const router = show(constantRoutes, `/iframe-page/${encodeURIComponent("https://example.com/public-controls")}`, true)
  const frame = await screen.findByTitle("嵌入页面")
  fireEvent.load(frame)
  await user.click(screen.getByRole("button", { name: "切换语言" }))
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "English" }))
  expect(await screen.findByTitle("Embedded page")).toBe(frame)
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: "Toggle theme" }))
  await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
  expect(screen.getByTitle("Embedded page")).toBe(frame)
  await user.click(screen.getByRole("button", { name: "Back home" }))
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
  expect(await screen.findByRole("heading", { name: "RapidKit Admin" })).toBeInTheDocument()
  useLocaleStore.getState().setLocale("zh-CN")
  useThemeStore.getState().setColorScheme("light")
})

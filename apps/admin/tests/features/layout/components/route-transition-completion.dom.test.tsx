// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { Link, Route, Routes } from "react-router"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { renderAdmin } from "@test/setup/render"
import { RouteTransition } from "@/features/layout/components/route-transition"
import { normalizeRoutes } from "@/features/router/route-model"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { useRouteStore } from "@/stores/route"

const originalAnimations = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations")
function animation(finished: Promise<unknown>) {
  // jsdom has no Web Animations implementation; only the completion contract is mocked.
  return { finished } as Animation
}
function deferred() {
  let finish: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}
const snapshot = normalizeRoutes(
  ["a", "b", "c"].map((name) => ({
    name,
    path: `/${name}`,
    component: `view.${name}`,
    meta: { title: name, keepAlive: true },
  })),
)
beforeEach(() => {
  useRouteCacheStore.getState().clear()
  useRouteStore.getState().replaceSnapshot(snapshot)
})
afterEach(() => {
  if (originalAnimations) Object.defineProperty(Element.prototype, "getAnimations", originalAnimations)
  else Reflect.deleteProperty(Element.prototype, "getAnimations")
  useRouteCacheStore.getState().clear()
  useRouteStore.getState().clearRoutes()
})
function app() {
  return renderAdmin(
    <>
      <Link to="/b">Go B</Link>
      <Link to="/c">Go C</Link>
      <Routes>
        <Route element={<RouteTransition />}>
          {["a", "b", "c"].map((name) => (
            <Route key={name} path={`/${name}`} element={<input aria-label={`${name} draft`} defaultValue="" />} />
          ))}
        </Route>
      </Routes>
    </>,
    { initialEntries: ["/a"] },
  )
}

test("finished CSS promises complete rapid navigation without a native animationEnd event", async () => {
  const exit = deferred(),
    enter = deferred()
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: function (this: Element) {
      return [animation(this.getAttribute("data-route-transition") === "exiting" ? exit.promise : enter.promise)]
    },
  })
  const { container } = app()
  const frame = () => container.querySelector("[data-route-transition]")!
  fireEvent.click(screen.getByRole("link", { name: "Go B" }))
  await waitFor(() => expect(frame()).toHaveAttribute("data-route-transition", "exiting"))
  fireEvent.click(screen.getByRole("link", { name: "Go C" }))
  await act(async () => {
    exit.finish()
  })
  await waitFor(() => expect(frame()).toHaveAttribute("data-route-transition", "entering"))
  expect(screen.getByLabelText("c draft")).toBeVisible()
  expect(frame()).toHaveAttribute("data-route-path", "/c")
  expect(screen.queryByLabelText("b draft")).not.toBeInTheDocument()
  await act(async () => {
    enter.finish()
  })
  await waitFor(() => expect(frame()).toHaveAttribute("data-route-transition", "idle"))
})

test.each(["finished", "absent"])("%s animations cannot strand navigation or refresh", async (mode) => {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => (mode === "finished" ? [animation(Promise.resolve())] : []),
  })
  const { container, queryClient } = app()
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  fireEvent.click(screen.getByRole("link", { name: "Go B" }))
  await waitFor(() => expect(screen.getByLabelText("b draft")).toBeVisible())
  await waitFor(() =>
    expect(container.querySelector("[data-route-transition]")).toHaveAttribute("data-route-transition", "idle"),
  )
  fireEvent.change(screen.getByLabelText("b draft"), { target: { value: "old draft" } })
  act(() => useRouteCacheStore.getState().requestRefresh("route:b"))
  await waitFor(() => expect(useRouteCacheStore.getState().refreshGenerations["route:b"]).toBe(1))
  await waitFor(() => expect(useRouteCacheStore.getState().pendingRefreshKey).toBeNull())
  expect(screen.getByLabelText("b draft")).toHaveValue("")
  expect(invalidate).toHaveBeenCalledTimes(1)
  expect(container.querySelector("[data-route-transition]")).toHaveAttribute("data-route-transition", "idle")
})

// @vitest-environment jsdom

import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { screen } from "@testing-library/react"
import { Route, Routes } from "react-router"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { UnknownRoute } from "@/features/router/unknown-route"

const routeExistUrl = "http://localhost:16000/api/v1/route/exist"

function UnknownRouteHarness() {
  return (
    <Routes>
      <Route path="/403" element={<h1>403</h1>} />
      <Route path="/404" element={<h1>404</h1>} />
      <Route path="*" element={<UnknownRoute />} />
    </Routes>
  )
}

afterEach(() => useAuthStore.setState({ token: "", refreshToken: "", userInfo: null, lastLogoutReason: null }))

test("an existing but unauthorized system route renders 403", async () => {
  useAuthStore.setState({ token: "token" })
  server.use(http.get(routeExistUrl, () => HttpResponse.json({ code: 0, message: "OK", data: true })))

  renderAdmin(<UnknownRouteHarness />, { initialEntries: ["/manage/user"] })

  expect(await screen.findByRole("heading", { name: "403" })).toBeInTheDocument()
})

test("a route absent from the system renders 404", async () => {
  useAuthStore.setState({ token: "token" })
  server.use(http.get(routeExistUrl, () => HttpResponse.json({ code: 0, message: "OK", data: false })))

  renderAdmin(<UnknownRouteHarness />, { initialEntries: ["/missing"] })

  expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument()
})

test("a route existence request failure stays retryable", async () => {
  useAuthStore.setState({ token: "token" })
  server.use(http.get(routeExistUrl, () => HttpResponse.error()))

  renderAdmin(<UnknownRouteHarness />, { initialEntries: ["/manage/user"] })

  expect(await screen.findByRole("button", { name: /Retry|重试/ })).toBeInTheDocument()
})

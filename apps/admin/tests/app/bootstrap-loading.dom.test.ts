// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest"
import { finishBootstrapLoading, setupBootstrapLoading } from "@/app/bootstrap-loading"

afterEach(() => {
  document.body.innerHTML = ""
  vi.useRealTimers()
})

test("the bootstrap loading overlay is created once outside the React root with the application font", () => {
  document.body.innerHTML = '<div id="app"></div>'

  setupBootstrapLoading()
  setupBootstrapLoading()

  const loading = document.getElementById("app-bootstrap-loading")
  expect(document.querySelectorAll("#app-bootstrap-loading")).toHaveLength(1)
  expect(loading?.parentElement).toBe(document.body)
  expect(loading?.className).toContain("font-sans")
  expect(loading?.textContent).toContain("RapidKit Admin")
})

test("the single bootstrap overlay fades out and is removed when the initial route is ready", () => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="app"></div>'
  setupBootstrapLoading()

  finishBootstrapLoading()

  expect(document.getElementById("app-bootstrap-loading")?.className).toContain("app-bootstrap-loading-exit")
  vi.runAllTimers()
  expect(document.getElementById("app-bootstrap-loading")).toBeNull()
})

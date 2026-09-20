// @vitest-environment jsdom

import { test, expect } from "vitest"
import { render } from "@testing-library/react"
import { NavigationProgress, resolveDocumentTitle, syncNavigationProgress } from "@/features/router/route-effects"

test("document title prefers the translated route key and includes the application title", () => {
  const translate = (key: string) => ({ "route.manage_user": "Users" })[key] ?? key

  expect(resolveDocumentTitle({ title: "Fallback", i18nKey: "route.manage_user" }, translate, "RapidKit Admin")).toBe(
    "Users - RapidKit Admin",
  )
  expect(resolveDocumentTitle({ title: "Reports" }, translate, "RapidKit Admin")).toBe("Reports - RapidKit Admin")
  expect(resolveDocumentTitle(undefined, translate, "RapidKit Admin")).toBe("RapidKit Admin")
})

test("route progress starts and completes through the NProgress adapter", () => {
  const calls: string[] = []
  const progress = {
    start: () => calls.push("start"),
    done: () => calls.push("done"),
  }

  syncNavigationProgress(true, true, progress)
  syncNavigationProgress(false, true, progress)
  syncNavigationProgress(true, false, progress)

  expect(calls).toEqual(["start", "done", "done"])
})

test("navigation progress reports state changes to one stable source", () => {
  const calls: Array<[string, boolean]> = []
  const controller = {
    set: (source: string, active: boolean) => calls.push([source, active]),
  }
  const { rerender } = render(<NavigationProgress active controller={controller} source="route" />)

  rerender(<NavigationProgress active={false} controller={controller} source="route" />)

  expect(calls).toEqual([
    ["route", true],
    ["route", false],
  ])
})

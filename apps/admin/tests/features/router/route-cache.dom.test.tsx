// @vitest-environment jsdom

import { useEffect, useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, test } from "vitest"

import { normalizeRoutes } from "@/features/router/route-model"
import { RouteCacheHost } from "@/features/router/route-cache"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { getRouteInstanceKey } from "@/features/router/route-instance-key"

const snapshot = normalizeRoutes([
  { name: "a", path: "/a", component: "view.a", meta: { title: "A", keepAlive: true } },
  { name: "b", path: "/b", component: "view.b", meta: { title: "B", keepAlive: true } },
  { name: "plain", path: "/plain", component: "view.plain", meta: { title: "Plain" } },
])

const unmounts: Record<string, number> = {}

function StatefulPage({ name }: { name: string }) {
  const [value, setValue] = useState("")
  useEffect(() => () => void (unmounts[name] = (unmounts[name] ?? 0) + 1), [name])
  return <input aria-label={name} value={value} onChange={(event) => setValue(event.target.value)} />
}

beforeEach(() => {
  Object.keys(unmounts).forEach((key) => delete unmounts[key])
  useRouteCacheStore.setState({ capacity: 10, entries: {}, activeKey: null, refreshGenerations: {} })
})

test("keeps cached React state mounted across route switches", () => {
  const { rerender } = render(
    <RouteCacheHost route={snapshot.byName.a!} pathSearch="/a">
      <StatefulPage name="a" />
    </RouteCacheHost>,
  )
  fireEvent.change(screen.getByLabelText("a"), { target: { value: "kept" } })

  rerender(
    <RouteCacheHost route={snapshot.byName.b!} pathSearch="/b">
      <StatefulPage name="b" />
    </RouteCacheHost>,
  )
  expect(screen.getByLabelText("a")).toHaveValue("kept")
  expect(screen.getByLabelText("a").closest("[data-route-cache-key]")).toHaveAttribute("hidden")

  rerender(
    <RouteCacheHost route={snapshot.byName.a!} pathSearch="/a">
      <StatefulPage name="a" />
    </RouteCacheHost>,
  )
  expect(screen.getByLabelText("a")).toHaveValue("kept")
  expect(unmounts.a).toBeUndefined()
})

test("refresh remounts only the selected cached instance", () => {
  render(
    <RouteCacheHost route={snapshot.byName.a!} pathSearch="/a">
      <StatefulPage name="a" />
    </RouteCacheHost>,
  )
  fireEvent.change(screen.getByLabelText("a"), { target: { value: "reset me" } })
  act(() => useRouteCacheStore.getState().refresh("route:a"))
  expect(screen.getByLabelText("a")).toHaveValue("")
  expect(unmounts.a).toBe(1)
})

test("does not retain routes without keepAlive", () => {
  const { rerender } = render(
    <RouteCacheHost route={snapshot.byName.plain!} pathSearch="/plain">
      <StatefulPage name="plain" />
    </RouteCacheHost>,
  )
  rerender(
    <RouteCacheHost route={snapshot.byName.a!} pathSearch="/a">
      <StatefulPage name="a" />
    </RouteCacheHost>,
  )
  expect(screen.queryByLabelText("plain")).toBeNull()
  expect(unmounts.plain).toBe(1)
})

test("refresh remounts the selected route without keepAlive", () => {
  render(
    <RouteCacheHost route={snapshot.byName.plain!} pathSearch="/plain">
      <StatefulPage name="plain" />
    </RouteCacheHost>,
  )
  fireEvent.change(screen.getByLabelText("plain"), { target: { value: "reset me" } })

  act(() =>
    useRouteCacheStore.getState().refresh(getRouteInstanceKey(snapshot.byName.plain!, "/plain")),
  )

  expect(screen.getByLabelText("plain")).toHaveValue("")
  expect(unmounts.plain).toBe(1)
})

import assert from "node:assert/strict"
import { beforeEach, test } from "vitest"

import { useRouteCacheStore } from "@/features/router/route-cache-store"

beforeEach(() => {
  useRouteCacheStore.setState({
    capacity: 2,
    entries: {},
    activeKey: null,
    refreshGenerations: {},
    pendingRefreshKey: null,
  })
})

test("registers, activates and refreshes cache metadata", () => {
  assert.deepEqual(useRouteCacheStore.getState().register({ cacheKey: "a", routeName: "a", fixed: false, now: 1 }), [])
  useRouteCacheStore.getState().activate("a", 2)
  useRouteCacheStore.getState().refresh("a")
  const state = useRouteCacheStore.getState()
  assert.equal(state.activeKey, "a")
  assert.equal(state.entries.a?.lastAccessedAt, 2)
  assert.equal(state.entries.a?.generation, 1)
})

test("evicts the least recently used inactive and non-fixed entry", () => {
  useRouteCacheStore.getState().register({ cacheKey: "fixed", routeName: "fixed", fixed: true, now: 0 })
  useRouteCacheStore.getState().register({ cacheKey: "old", routeName: "old", fixed: false, now: 1 })
  useRouteCacheStore.getState().activate("fixed", 2)
  const evicted = useRouteCacheStore.getState().register({ cacheKey: "new", routeName: "new", fixed: false, now: 3 })
  assert.deepEqual(evicted, ["old"])
  assert.deepEqual(Object.keys(useRouteCacheStore.getState().entries).sort(), ["fixed", "new"])
})

test("refuses a new cache entry when fixed entries occupy capacity", () => {
  useRouteCacheStore.getState().register({ cacheKey: "a", routeName: "a", fixed: true, now: 0 })
  useRouteCacheStore.getState().register({ cacheKey: "b", routeName: "b", fixed: true, now: 1 })
  assert.deepEqual(
    useRouteCacheStore.getState().register({ cacheKey: "new", routeName: "new", fixed: false, now: 2 }),
    ["new"],
  )
  assert.equal(useRouteCacheStore.getState().entries.new, undefined)
})

test("reconciles and clears cache entries", () => {
  useRouteCacheStore.getState().register({ cacheKey: "a", routeName: "a", fixed: false, now: 0 })
  useRouteCacheStore.getState().register({ cacheKey: "b", routeName: "b", fixed: false, now: 1 })
  useRouteCacheStore.getState().activate("b", 2)
  useRouteCacheStore.getState().reconcile(new Set(["a"]))
  assert.deepEqual(Object.keys(useRouteCacheStore.getState().entries), ["a"])
  assert.equal(useRouteCacheStore.getState().activeKey, null)
  useRouteCacheStore.getState().clear()
  assert.deepEqual(useRouteCacheStore.getState().entries, {})
})

test("refreshes only the requested route instance", () => {
  useRouteCacheStore.getState().refresh("route:users")
  useRouteCacheStore.getState().refresh("route:users")

  assert.deepEqual(useRouteCacheStore.getState().refreshGenerations, { "route:users": 2 })
  assert.equal(useRouteCacheStore.getState().refreshGenerations["route:roles"], undefined)
})

test("clear removes route refresh generations", () => {
  useRouteCacheStore.getState().refresh("route:users")
  useRouteCacheStore.getState().clear()
  assert.deepEqual(useRouteCacheStore.getState().refreshGenerations, {})
})

test("tracks a refresh request until the transition completes", () => {
  useRouteCacheStore.getState().requestRefresh("route:users")
  assert.equal(useRouteCacheStore.getState().pendingRefreshKey, "route:users")

  useRouteCacheStore.getState().completeRefresh()
  assert.equal(useRouteCacheStore.getState().pendingRefreshKey, null)
})

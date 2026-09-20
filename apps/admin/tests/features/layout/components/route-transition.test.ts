import assert from "node:assert/strict"
import { test } from "vitest"

import { transitionRoute, type RouteTransitionState } from "@/features/layout/components/route-transition"

const initial: RouteTransitionState = {
  displayedKey: "/a",
  pendingKey: null,
  phase: "idle",
}

test("navigation exits the displayed route before entering the pending route", () => {
  const exiting = transitionRoute(initial, { type: "navigate", key: "/b", animate: true })

  assert.deepEqual(exiting, { displayedKey: "/a", pendingKey: "/b", phase: "exiting" })
  assert.deepEqual(transitionRoute(exiting, { type: "animationEnd" }), {
    displayedKey: "/b",
    pendingKey: null,
    phase: "entering",
  })
})

test("rapid navigation retains only the newest pending route", () => {
  const exiting = transitionRoute(initial, { type: "navigate", key: "/b", animate: true })
  const redirected = transitionRoute(exiting, { type: "navigate", key: "/c", animate: true })

  assert.equal(redirected.pendingKey, "/c")
  assert.equal(transitionRoute(redirected, { type: "animationEnd" }).displayedKey, "/c")
})

test("the entrance completion returns the transition to idle", () => {
  const entering: RouteTransitionState = {
    displayedKey: "/b",
    pendingKey: null,
    phase: "entering",
  }

  assert.deepEqual(transitionRoute(entering, { type: "animationEnd" }), {
    displayedKey: "/b",
    pendingKey: null,
    phase: "idle",
  })
})

test("navigation swaps the displayed route immediately when motion is disabled", () => {
  assert.deepEqual(transitionRoute(initial, { type: "navigate", key: "/b", animate: false }), {
    displayedKey: "/b",
    pendingKey: null,
    phase: "idle",
  })
})

test("refresh exits and re-enters the currently displayed route", () => {
  const exiting = transitionRoute(initial, { type: "refresh", animate: true })
  assert.deepEqual(exiting, { ...initial, phase: "exiting", refreshing: true })

  const entering = transitionRoute(exiting, { type: "animationEnd" })
  assert.deepEqual(entering, { ...initial, phase: "entering", refreshing: true })

  assert.deepEqual(transitionRoute(entering, { type: "animationEnd" }), initial)
})

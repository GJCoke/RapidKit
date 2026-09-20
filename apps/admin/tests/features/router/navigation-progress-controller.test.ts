import { expect, test } from "vitest"
import { createNavigationProgressController } from "@/features/router/navigation-progress-controller"

test("multiple loading sources share one uninterrupted progress cycle", () => {
  const calls: string[] = []
  const scheduled: Array<() => void> = []
  const cancelled = new Set<number>()
  const controller = createNavigationProgressController(
    { start: () => calls.push("start"), done: () => calls.push("done") },
    {
      schedule: (callback) => {
        scheduled.push(callback)
        return scheduled.length - 1
      },
      cancel: (id) => cancelled.add(id),
    },
  )

  controller.set("app", true)
  controller.set("route", true)
  controller.set("app", false)
  controller.set("route", false)
  expect(calls).toEqual(["start"])

  controller.set("route", true)
  expect(cancelled).toContain(0)
  scheduled[0]?.()
  expect(calls).toEqual(["start"])

  controller.set("route", false)
  scheduled[1]?.()
  expect(calls).toEqual(["start", "done"])
})

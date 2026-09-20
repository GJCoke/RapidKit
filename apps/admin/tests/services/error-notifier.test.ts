import assert from "node:assert/strict"
import { test } from "vitest"
import { createErrorNotifier } from "@/services/error-notifier"

test("error notifier suppresses identical errors during the cooldown", () => {
  const notifications: string[] = []
  let now = 1_000
  const notifier = createErrorNotifier({
    notify: (message) => notifications.push(message),
    now: () => now,
    cooldownMs: 5_000,
  })
  const error = { kind: "network" as const, code: "ERR_NETWORK", message: "Offline" }

  notifier.show(error)
  notifier.show(error)
  now += 5_001
  notifier.show(error)

  assert.deepEqual(notifications, ["Offline", "Offline"])
})

test("error notifier keeps distinct errors independent", () => {
  const notifications: string[] = []
  const notifier = createErrorNotifier({ notify: (message) => notifications.push(message), now: () => 1_000 })

  notifier.show({ kind: "business", code: "15001", message: "Invalid" })
  notifier.show({ kind: "business", code: "15002", message: "Forbidden" })

  assert.deepEqual(notifications, ["Invalid", "Forbidden"])
})

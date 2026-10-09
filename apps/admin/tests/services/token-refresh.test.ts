import assert from "node:assert/strict"
import { test } from "vitest"

import { createTokenRefreshCoordinator } from "@/services/token-refresh"

test("concurrent token refresh calls share one in-flight operation", async () => {
  let refreshCount = 0
  let releaseRefresh: ((value: boolean) => void) | undefined
  const coordinator = createTokenRefreshCoordinator(
    () =>
      new Promise<boolean>((resolve) => {
        refreshCount += 1
        releaseRefresh = resolve
      }),
  )

  const first = coordinator.refresh()
  const second = coordinator.refresh()

  assert.equal(refreshCount, 1)
  assert.equal(first, second)
  releaseRefresh?.(true)
  assert.deepEqual(await Promise.all([first, second]), [true, true])
})

test("a failed refresh is shared and the next request can try again", async () => {
  let refreshCount = 0
  const coordinator = createTokenRefreshCoordinator(async () => {
    refreshCount += 1
    if (refreshCount === 1) throw new Error("refresh failed")
    return true
  })

  const first = coordinator.refresh()
  const second = coordinator.refresh()
  await assert.rejects(first, /refresh failed/)
  await assert.rejects(second, /refresh failed/)

  assert.equal(await coordinator.refresh(), true)
  assert.equal(refreshCount, 2)
})

test("different sessions refresh independently while old cleanup preserves the new operation", async () => {
  const releases: Array<(value: boolean) => void> = []
  const coordinator = createTokenRefreshCoordinator(() => new Promise<boolean>((resolve) => releases.push(resolve)))
  const old = coordinator.refresh(1)
  const current = coordinator.refresh(2)
  assert.equal(releases.length, 2)
  releases[0](false)
  assert.equal(await old, false)
  assert.equal(coordinator.refresh(2), current)
  releases[1](true)
  assert.equal(await current, true)
})

import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { installIdentitySync } from "@/store/modules/auth/identity-sync"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("window", { localStorage: {} })
})
afterEach(() => {
  vi.useRealTimers()
})
function event(key: string | null, storageArea?: object) {
  return Object.assign(new Event("storage"), { key, storageArea })
}

it("uses prefixed raw keys, ignores unrelated settings, and coalesces a transition", async () => {
  const target = new EventTarget()
  const reload = vi.fn()
  const dispose = installIdentitySync(target, "app-", reload)
  for (const key of ["app-lang", "app-themeSettings", "token"]) target.dispatchEvent(event(key))
  await vi.runOnlyPendingTimersAsync()
  expect(reload).not.toHaveBeenCalled()
  for (const key of ["app-token", "app-impersonation", null]) target.dispatchEvent(event(key))
  await vi.runOnlyPendingTimersAsync()
  expect(reload).toHaveBeenCalledOnce()
  dispose()
  target.dispatchEvent(event("app-token"))
  await vi.runOnlyPendingTimersAsync()
  expect(reload).toHaveBeenCalledOnce()
})

it("ignores another storage area and cancels queued reload on disposal", async () => {
  const target = new EventTarget()
  const reload = vi.fn()
  const dispose = installIdentitySync(target, "app-", reload)
  target.dispatchEvent(event("app-token", {}))
  await vi.runOnlyPendingTimersAsync()
  expect(reload).not.toHaveBeenCalled()
  target.dispatchEvent(event(null))
  dispose()
  await vi.runOnlyPendingTimersAsync()
  expect(reload).not.toHaveBeenCalled()
})

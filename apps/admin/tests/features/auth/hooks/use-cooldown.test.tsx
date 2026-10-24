// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useCooldown } from "@/features/auth/hooks/use-cooldown"
afterEach(() => vi.useRealTimers())
test("cooldown starts immediately, expires and catches up after a background clock jump", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-24T00:00:00Z"))
  const hook = renderHook(() => useCooldown())
  expect(hook.result.current.seconds).toBe(0)
  act(() => hook.result.current.start(60))
  expect(hook.result.current.seconds).toBe(60)
  act(() => vi.advanceTimersByTime(1000))
  expect(hook.result.current.seconds).toBe(59)
  act(() => {
    vi.setSystemTime(new Date("2026-10-24T00:02:00Z"))
    window.dispatchEvent(new Event("focus"))
  })
  expect(hook.result.current.seconds).toBe(0)
  act(() => hook.result.current.start(2))
  expect(hook.result.current.seconds).toBe(2)
  act(() => vi.advanceTimersByTime(2000))
  expect(hook.result.current.seconds).toBe(0)
  hook.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

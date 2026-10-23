// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClientProvider, notifyManager } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { createTestQueryClient } from "@test/setup/render"
import { createScheduleDraft } from "@/shared/schedule-editor/schedule-model"
import { useSchedulePreview } from "@/shared/schedule-editor/use-schedule-preview"
import type { SchedulePreview } from "@/services/api/schedule"
const preview = (marker = "fresh", valid = true): SchedulePreview => ({
  valid,
  timezone: "Asia/Shanghai",
  evaluatedAt: "2026-10-24T12:00:00+08:00",
  nextRuns: [marker],
  horizonYears: 5,
})
function setup() {
  const client = createTestQueryClient(),
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  return { client, wrapper }
}
beforeEach(() => {
  vi.useFakeTimers()
  notifyManager.setScheduler((callback) => queueMicrotask(callback))
})
afterEach(() => {
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  vi.useRealTimers()
})
async function tick(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
test("preview debounces edits, invalidates old data immediately and skips locally invalid schedules", async () => {
  const { wrapper } = setup(),
    load = vi.fn().mockResolvedValue(preview())
  const hook = renderHook(({ draft }) => useSchedulePreview(draft, load, ["test-opening"]), {
    wrapper,
    initialProps: { draft: createScheduleDraft() },
  })
  await tick(299)
  expect(load).not.toHaveBeenCalled()
  await tick(1)
  expect(load).toHaveBeenCalledTimes(1)
  expect(hook.result.current.preview?.valid).toBe(true)
  hook.rerender({ draft: { ...createScheduleDraft(), interval: { every: 5, period: "minutes" } } })
  expect(hook.result.current.preview).toBeUndefined()
  await tick(300)
  expect(load).toHaveBeenLastCalledWith({ type: "interval", every: 5, period: "minutes" })
  hook.rerender({ draft: { ...createScheduleDraft(), interval: { every: null, period: "minutes" } } })
  await tick(300)
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => expect(await hook.result.current.validate()).toBe(false))
})
test("submit bypasses debounce, shares an active preview and does not schedule a duplicate request", async () => {
  const { wrapper } = setup()
  let release!: (value: SchedulePreview) => void
  const load = vi.fn(
    () =>
      new Promise<SchedulePreview>((resolve) => {
        release = resolve
      }),
  )
  const hook = renderHook(() => useSchedulePreview(createScheduleDraft(), load, ["test-opening"]), { wrapper })
  let one!: Promise<boolean>, two!: Promise<boolean>
  act(() => {
    one = hook.result.current.validate()
    two = hook.result.current.validate()
  })
  await tick(0)
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => {
    release(preview())
    expect(await one).toBe(true)
    expect(await two).toBe(true)
  })
  await tick(500)
  expect(load).toHaveBeenCalledTimes(1)
  expect(hook.result.current.preview?.nextRuns).toEqual(["fresh"])
})
test("older generations, even after switching back to identical values, cannot validate the current draft", async () => {
  const { wrapper } = setup(),
    resolvers: ((value: SchedulePreview) => void)[] = [],
    load = vi.fn(() => new Promise<SchedulePreview>((resolve) => resolvers.push(resolve))),
    initial = createScheduleDraft()
  const hook = renderHook(({ draft }) => useSchedulePreview(draft, load, ["test-opening"]), {
    wrapper,
    initialProps: { draft: initial },
  })
  let old!: Promise<boolean>
  act(() => {
    old = hook.result.current.validate()
  })
  await tick(0)
  hook.rerender({ draft: { ...initial, interval: { every: 10, period: "minutes" } } })
  hook.rerender({ draft: initial })
  expect(hook.result.current.preview).toBeUndefined()
  let current!: Promise<boolean>
  act(() => {
    current = hook.result.current.validate()
  })
  await tick(0)
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => {
    resolvers[0](preview("old"))
    expect(await old).toBe(false)
  })
  expect(hook.result.current.preview).toBeUndefined()
  await act(async () => {
    resolvers[1](preview("new"))
    expect(await current).toBe(true)
  })
  expect(hook.result.current.preview?.nextRuns).toEqual(["new"])
})
test("failed and semantically invalid server previews block validation but retry retains the same editable draft", async () => {
  const { wrapper } = setup(),
    load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(preview("invalid", false))
      .mockResolvedValueOnce(preview())
  const hook = renderHook(() => useSchedulePreview(createScheduleDraft(), load, ["test-opening"]), { wrapper })
  await tick(300)
  expect(hook.result.current.failed).toBe(true)
  await act(async () => expect(await hook.result.current.validate()).toBe(false))
  expect(hook.result.current.preview?.valid).toBe(false)
  await act(async () => expect(await hook.result.current.refresh()).toBe(true))
  expect(hook.result.current.preview?.valid).toBe(true)
})
test("unmounted editors reject late preview validation and retained submit callbacks", async () => {
  const { wrapper } = setup()
  let release!: (value: SchedulePreview) => void
  const load = vi.fn(
      () =>
        new Promise<SchedulePreview>((resolve) => {
          release = resolve
        }),
    ),
    hook = renderHook(() => useSchedulePreview(createScheduleDraft(), load, ["test-opening"]), { wrapper })
  let pending!: Promise<boolean>
  act(() => {
    pending = hook.result.current.validate()
  })
  await tick(0)
  const retained = hook.result.current.validate
  hook.unmount()
  await act(async () => {
    release(preview())
    expect(await pending).toBe(false)
    expect(await retained()).toBe(false)
  })
  expect(load).toHaveBeenCalledTimes(1)
})

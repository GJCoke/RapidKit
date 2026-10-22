import { effectScope, ref } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import { useScheduleEditor } from "../../src/components/common/schedule-editor/use-schedule-editor"
import { useSchedulePreview } from "../../src/components/common/schedule-editor/use-schedule-preview"
import { validInterval, validSolar } from "../../src/components/common/schedule-editor/schedule"
import type { ScheduleValue, SchedulePreview } from "../../src/components/common/schedule-editor/schedule"
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.forEach((s) => s.stop())
  vi.useRealTimers()
})
function scoped<T>(fn: () => T): T {
  const s = effectScope()
  scopes.push(s)
  return s.run(fn)!
}
function latitude(value: ScheduleValue) {
  if (value.type !== "solar") throw new Error("Expected solar")
  return value.latitude
}
const good: SchedulePreview = {
  valid: true,
  timezone: "Asia/Shanghai",
  evaluatedAt: "2026-10-08T09:02:00+08:00",
  nextRuns: [],
  horizonYears: 5,
}
it("preserves drafts through all modes and resets the editing session on external replacement", () => {
  const model = ref<ScheduleValue>({ type: "interval", every: 15, period: "minutes" })
  const ui = scoped(() => useScheduleEditor(model))
  ui.select("solar")
  if (model.value.type !== "solar") throw new Error("Expected solar")
  model.value.latitude = -37.81753
  ui.select("crontab")
  ui.select("interval")
  expect(model.value).toEqual({ type: "interval", every: 15, period: "minutes" })
  ui.select("solar")
  expect(latitude(model.value)).toBe(-37.81753)
  model.value = { type: "interval", every: 30, period: "seconds" }
  ui.select("solar")
  expect(latitude(model.value)).toBe(0)
})
it("validates finite coordinates and positive integer intervals", () => {
  expect(validSolar({ event: "sunrise", latitude: -37.81753, longitude: 144.96715 })).toBe(true)
  for (const latitude of [null, NaN, Infinity, 90.01])
    expect(validSolar({ event: "sunrise", latitude, longitude: 0 })).toBe(false)
  for (const every of [null, 0, 1.5, Infinity, 2147483648])
    expect(validInterval({ every, period: "minutes" })).toBe(false)
})
it("invalidates pending previews and submit validation on field changes", async () => {
  const model = ref({ every: 15, period: "minutes" as const })
  let done!: (v: SchedulePreview) => void
  const ui = scoped(() =>
    useSchedulePreview(
      model,
      () => () =>
        new Promise((r) => {
          done = r
        }),
      () => validInterval(model.value),
    ),
  )
  const submit = ui.validate()
  await Promise.resolve()
  model.value.every = 30
  done(good)
  expect(await submit).toBe(false)
  expect(ui.preview.value).toBeNull()
})
it("does not preview invalid local input and recovers after adapter failure", async () => {
  const model = ref({ every: null as number | null, period: "seconds" as const })
  const loader = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(good)
  const ui = scoped(() =>
    useSchedulePreview(
      model,
      () => loader,
      () => validInterval(model.value),
    ),
  )
  expect(await ui.validate()).toBe(false)
  expect(loader).not.toHaveBeenCalled()
  model.value.every = 30
  expect(await ui.validate()).toBe(false)
  expect(ui.previewFailed.value).toBe(true)
  expect(await ui.validate()).toBe(true)
})

import { effectScope, ref } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useCrontabEditor } from "../../src/components/common/crontab-editor/use-crontab-editor"
import type { CrontabPreview, CrontabValue } from "../../src/components/common/crontab-editor/cron"

const initial: CrontabValue = { minute: "30", hour: "9", dayOfMonth: "*", monthOfYear: "*", dayOfWeek: "1-5" }
const good: CrontabPreview = {
  valid: true,
  timezone: "Asia/Shanghai",
  evaluatedAt: "2026-10-08 16:00:00",
  nextRuns: ["2026-10-09 09:30:00"],
  horizonYears: 5,
}
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.forEach((s) => s.stop())
  vi.useRealTimers()
})
function setup(loader: (v: CrontabValue) => Promise<CrontabPreview | null> = async () => good) {
  const scope = effectScope()
  scopes.push(scope)
  const model = ref({ ...initial })
  return { model, ...scope.run(() => useCrontabEditor(model, () => loader))! }
}
describe("Cron draft validation", () => {
  it("reloads field edits made by the caller on the emitted model object", () => {
    const ui = setup()
    ui.draft.value.time = "10:45"
    ui.model.value.minute = "15"
    expect(ui.draft.value.time).toBe("10:15")
  })
  it("recovers when a preview adapter throws synchronously", async () => {
    let failing = true
    const ui = setup(() => {
      if (failing) throw new Error("offline")
      return Promise.resolve(good)
    })
    expect(await ui.validate()).toBe(false)
    failing = false
    expect(await ui.validate()).toBe(true)
  })
  it("submits current input immediately without waiting for the debounce", async () => {
    const ui = setup(async (value) => ({ ...good, valid: value.minute !== "60", errorField: "minute" }))
    ui.draft.value.mode = "advanced"
    ui.draft.value.expression = "60 9 * * 1-5"
    expect(await ui.validate()).toBe(false)
    expect(ui.preview.value?.valid).toBe(false)
    ui.draft.value.expression = "45 9 * * 1-5"
    expect(await ui.validate()).toBe(true)
    expect(ui.model.value.minute).toBe("45")
  })
  it("rejects empty selections even if the model retains old valid fields", async () => {
    const ui = setup()
    ui.draft.value.weekdays = []
    expect(ui.localError.value).toBe("weekdays")
    expect(await ui.validate()).toBe(false)
    expect(ui.preview.value).toBeNull()
  })
  it("discards obsolete responses and invalidates an in-flight submission on edits", async () => {
    let resolve!: (value: CrontabPreview) => void
    const ui = setup(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const submission = ui.validate()
    await Promise.resolve()
    ui.draft.value.time = "10:45"
    resolve(good)
    expect(await submission).toBe(false)
    expect(ui.preview.value).toBeNull()
    expect(ui.model.value.hour).toBe("10")
  })
  it("preserves draft spacing and resets when a new external value arrives", () => {
    const ui = setup()
    ui.draft.value.mode = "advanced"
    ui.draft.value.expression = "  15   10  * *  0 "
    expect(ui.draft.value.expression).toBe("  15   10  * *  0 ")
    ui.model.value = { ...initial }
    expect(ui.draft.value.mode).toBe("weekly")
    expect(ui.draft.value.time).toBe("09:30")
  })
  it("blocks unavailable previews and recovers on retry", async () => {
    let failing = true
    const ui = setup(async () => {
      if (failing) throw new Error("offline")
      return good
    })
    expect(await ui.validate()).toBe(false)
    expect(ui.previewFailed.value).toBe(true)
    failing = false
    expect(await ui.validate()).toBe(true)
  })
})

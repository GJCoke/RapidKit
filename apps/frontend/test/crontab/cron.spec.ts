import { describe, expect, it } from "vitest"
import { decodeCron, encodeCron, formatCron } from "../../src/components/common/crontab-editor/cron"

const all = { minute: "*", hour: "*", dayOfMonth: "*", monthOfYear: "*", dayOfWeek: "*" }
describe("Cron preset round trips", () => {
  it.each([
    [all, "minutes"],
    [{ ...all, minute: "*/15" }, "minutes"],
    [{ ...all, minute: "45" }, "hourly"],
    [{ ...all, minute: "30", hour: "9" }, "daily"],
    [{ ...all, minute: "30", hour: "9", dayOfWeek: "1-5" }, "weekly"],
    [{ ...all, minute: "30", hour: "9", dayOfMonth: "1,15" }, "monthly"],
  ])("recognizes %o as %s", (value, mode) => {
    const draft = decodeCron(value)
    expect(draft.mode).toBe(mode)
    expect(encodeCron(draft).value).toEqual(value)
  })
  it.each([
    { ...all, minute: "*/7" },
    { ...all, minute: "0", hour: "9", dayOfWeek: "mon-fri" },
    { ...all, minute: "0", hour: "9", dayOfMonth: "1", dayOfWeek: "0" },
    { ...all, minute: "0", hour: "9", monthOfYear: "1-6" },
  ])("keeps complex expressions lossless in advanced mode: %o", (value) => {
    const draft = decodeCron(value)
    expect(draft.mode).toBe("advanced")
    expect(formatCron(encodeCron(draft).value!)).toBe(formatCron(value))
  })
  it("requires weekday/date/time selections and five advanced fields", () => {
    const draft = decodeCron({ ...all, minute: "30", hour: "9" })
    draft.mode = "weekly"
    draft.weekdays = []
    expect(encodeCron(draft).error).toBe("weekdays")
    draft.mode = "monthly"
    draft.monthDays = []
    expect(encodeCron(draft).error).toBe("days")
    draft.mode = "daily"
    draft.time = null
    expect(encodeCron(draft).error).toBe("time")
    draft.mode = "advanced"
    draft.expression = "0 0 * *"
    expect(encodeCron(draft).error).toBe("fields")
  })
})

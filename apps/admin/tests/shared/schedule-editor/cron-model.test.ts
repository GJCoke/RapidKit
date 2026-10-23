import { expect, test } from "vitest"
import { decodeCron, encodeCron, formatCron, type CrontabValue } from "@/shared/schedule-editor/cron-model"
const cron = (expression: string): CrontabValue => {
  const [minute = "*", hour = "*", dayOfMonth = "*", monthOfYear = "*", dayOfWeek = "*"] = expression.split(" ")
  return { minute, hour, dayOfMonth, monthOfYear, dayOfWeek }
}
test("canonical Celery forms select the six source modes and round-trip without loss", () => {
  for (const [expression, mode] of [
    ["*/15 * * * *", "minutes"],
    ["* * * * *", "minutes"],
    ["5 * * * *", "hourly"],
    ["30 9 * * *", "daily"],
    ["30 9 * * 1-5", "weekly"],
    ["30 9 1,15 * *", "monthly"],
    ["0 9 * jan mon-fri", "advanced"],
  ]) {
    const draft = decodeCron(cron(expression))
    expect(draft.mode).toBe(mode)
    expect(formatCron(encodeCron(draft).value!)).toBe(expression)
  }
})
test("noncanonical but valid rules retain exact field text in advanced mode", () => {
  for (const expression of [
    "*/1 * * * *",
    "00 09 * * *",
    "0 9 * * 1,2,3,4,5",
    "0 9 * * 5,1",
    "0 9 1 * 1",
    "0 9 * jan mon-fri",
  ]) {
    const draft = decodeCron(cron(expression))
    expect(draft.mode).toBe("advanced")
    expect(formatCron(encodeCron(draft).value!)).toBe(expression)
  }
})
test("weekly and monthly controls reject empty/out-of-range selections and emit canonical Sunday-zero fields", () => {
  const weekly = { ...decodeCron(cron("30 9 * * 1-5")), weekdays: [6, 0, 6] }
  expect(encodeCron(weekly).value?.dayOfWeek).toBe("0,6")
  expect(encodeCron({ ...weekly, weekdays: [] }).error).toBe("weekdays")
  expect(encodeCron({ ...weekly, weekdays: [7] }).error).toBe("weekdays")
  const monthly = { ...weekly, mode: "monthly" as const, monthDays: [31, 1, 31] }
  expect(encodeCron(monthly).value?.dayOfMonth).toBe("1,31")
  expect(encodeCron({ ...monthly, monthDays: [0] }).error).toBe("days")
  expect(encodeCron({ ...monthly, monthDays: [] }).error).toBe("days")
  expect(encodeCron({ ...monthly, time: "24:00" }).error).toBe("time")
})
test("advanced syntax is bounded locally but semantic Celery validation belongs to authoritative preview", () => {
  const base = { ...decodeCron(cron("0 9 * * *")), mode: "advanced" as const }
  expect(encodeCron({ ...base, expression: "1 2 3" }).error).toBe("fields")
  expect(encodeCron({ ...base, expression: `${"x".repeat(129)} * * * *` }).error).toBe("fields")
  expect(encodeCron({ ...base, expression: "  99   0 * * *  " }).value).toEqual(cron("99 0 * * *"))
  expect(encodeCron({ ...base, mode: "minutes", interval: 7 }).error).toBe("fields")
  expect(encodeCron({ ...base, mode: "hourly", minute: 60 }).error).toBe("fields")
})

import { expect, test } from "vitest"
import { formatTemplateText } from "@/features/notifications/template-preview"
test("template preview handles escaped braces, Python booleans and literal replacement values", () => {
  expect(formatTemplateText("{{name}} {name} {flag}", { name: "$& <b>literal</b>", flag: false })).toEqual({
    text: "{name} $& <b>literal</b> False",
    issues: [],
  })
})
test("template preview never evaluates expressions or unsupported Python formats", () => {
  const result = formatTemplateText("{price:.2f} {user.name} {missing}", { price: 3 })
  expect(result.text).toBe("{price:.2f} {user.name} {missing}")
  expect(result.issues).toEqual(["{price:.2f}", "{user.name}", "missing"])
})
test("unbalanced braces remain visible and are reported", () => {
  expect(formatTemplateText("open {name then } end }", {})).toEqual({
    text: "open {name then } end }",
    issues: ["{name then }", "}"],
  })
  expect(formatTemplateText("{name", { name: "Reader" })).toEqual({ text: "{name", issues: ["{name"] })
})

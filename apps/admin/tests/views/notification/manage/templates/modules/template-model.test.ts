import { expect, test } from "vitest"
import type { NotificationTemplate } from "@/services/api/notification-template"
import {
  emptyTemplateForm,
  restoreTemplateForm,
  parseTemplateSchema,
  templateSchemaRows,
  templateRowsSchema,
  templateExample,
  buildTemplatePayload,
  templatePreview,
  insertTemplateVariable,
  type TemplateVariableRow,
} from "@/views/notification/manage/templates/modules/template-model"
const row = (name: string, example = "", type = "string"): TemplateVariableRow => ({
  name,
  type,
  required: false,
  example,
  rule: {},
})
const form = () => ({
  ...emptyTemplateForm(),
  code: " welcome ",
  name: " Welcome ",
  category: " user.invited ",
  titleTemplate: "Hello {name}",
  contentTemplate: "Body",
  variables: [row("name", "Alex")],
})
const saved: NotificationTemplate = {
  id: "template",
  code: "welcome",
  name: "Welcome",
  category: "user.invited",
  level: "warning",
  contentMode: "raw",
  titleTemplate: "Hello {name}",
  contentTemplate: "Body",
  contentFormat: "markdown",
  variableSchema: {
    name: { type: "string", required: true, example: "Alex", default: "Reader", description: "Preserved" },
  },
  defaultChannels: ["in_app"],
  defaultAction: { type: "external", url: "https://example.test" },
  mandatory: true,
  enabled: false,
  version: 3,
  createTime: "",
  updateTime: "",
}
test("schema table and JSON preserve extended rules, defaults, explicit false and examples arrays", () => {
  const schema = parseTemplateSchema(
    JSON.stringify({
      flag: { type: "boolean", required: false, examples: [false], default: true, enum: [true, false] },
      minimal: { description: "Hint" },
    }),
  )
  const rows = templateSchemaRows(schema)
  expect(rows[0]).toMatchObject({ name: "flag", type: "boolean", required: false, example: "false" })
  const result = templateRowsSchema(rows)
  expect(result).toMatchObject({
    flag: { example: false, examples: [false], default: true, enum: [true, false], required: false },
    minimal: { description: "Hint" },
  })
  expect(result.minimal).not.toHaveProperty("type")
  expect(result.minimal).not.toHaveProperty("required")
})
test.each(["[]", "null", '{"x":[]}', '{"x":{"type":"object"}}', '{"x":{"required":"true"}}', '{" ":{}}'])(
  "invalid schema %s cannot be accepted",
  (text) => expect(() => parseTemplateSchema(text)).toThrow("schemaInvalid"),
)
test("variable rows reject empty and duplicate names instead of silently overwriting rules", () => {
  expect(() => templateRowsSchema([row("")])).toThrow("schemaInvalid")
  expect(() => templateRowsSchema([row("name"), row("name")])).toThrow("schemaInvalid")
})
test("typed examples retain false and zero, reject unsafe integers, and never consume delivery defaults", () => {
  expect(templateExample(row("flag", "false", "boolean"))).toBe(false)
  expect(templateExample(row("count", "0", "integer"))).toBe(0)
  expect(templateExample(row("number", "1.5e2", "number"))).toBe(150)
  expect(templateExample({ ...row("name"), rule: { default: "DEFAULT" } })).toBeUndefined()
  expect(templateExample(row("name", "  Alex  "))).toBe("  Alex  ")
  for (const value of ["1e2", "1.5", "0x10", "9007199254740992"])
    expect(() => templateExample(row("count", value, "integer"))).toThrow("schemaInvalid")
  expect(() => templateExample(row("flag", "False", "boolean"))).toThrow("schemaInvalid")
})
test("raw previews render safe scalar text and distinguish undeclared, missing, invalid and complex formats", () => {
  const preview = templatePreview(
    {
      contentMode: "raw",
      titleTemplate: "{{hello}} {name} {count}",
      contentTemplate: "{flag} {unknown} {missing} {bad} {count:.2f} {unfinished",
    },
    [
      row("name", "<img>"),
      row("count", "0", "integer"),
      row("flag", "false", "boolean"),
      row("missing"),
      row("bad", "wrong", "integer"),
    ],
    (key) => key,
  )
  expect(preview.title).toBe("{hello} <img> 0")
  expect(preview.content).toContain("False")
  expect(preview.issues).toEqual(
    expect.arrayContaining([
      { kind: "undeclared", name: "unknown" },
      { kind: "missingExample", name: "missing" },
      { kind: "invalidExample", name: "bad" },
      { kind: "unsupportedFormat", name: "{count:.2f}" },
      { kind: "invalidFormat", name: "{unfinished" },
    ]),
  )
})
test("i18n previews pass typed examples to the active translator and report missing resources", () => {
  const seen: unknown[] = []
  const preview = templatePreview(
    { contentMode: "i18n", titleTemplate: "notice.title", contentTemplate: "notice.missing" },
    [row("count", "0", "integer"), row("flag", "false", "boolean")],
    (key, params) => {
      seen.push([key, params])
      return key === "notice.title" ? "Translated" : key
    },
  )
  expect(preview.title).toBe("Translated")
  expect(preview.issues).toContainEqual({ kind: "translationMissing", name: "notice.missing" })
  expect(seen).toEqual([
    ["notice.title", { count: 0, flag: false }],
    ["notice.missing", { count: 0, flag: false }],
  ])
})
test("new payloads trim identifiers, retain text and save typed examples without publishing", () => {
  expect(buildTemplatePayload(form())).toEqual({
    code: "welcome",
    name: "Welcome",
    category: "user.invited",
    level: "info",
    contentMode: "raw",
    titleTemplate: "Hello {name}",
    contentTemplate: "Body",
    contentFormat: "plain_text",
    variableSchema: { name: { example: "Alex" } },
    defaultChannels: ["in_app"],
    mandatory: false,
    enabled: true,
  })
})
test("editing locks identity and content mode while preserving schema metadata, format and channels", () => {
  const restored = restoreTemplateForm(saved)
  expect(restored).toMatchObject({ enabled: false, mandatory: true, contentFormat: "markdown" })
  const payload = buildTemplatePayload({ ...restored, code: "tampered", contentMode: "i18n" }, saved)
  expect(payload).not.toHaveProperty("code")
  expect(payload).not.toHaveProperty("contentMode")
  expect(payload).not.toHaveProperty("defaultAction")
  expect(payload).not.toHaveProperty("id")
  expect(payload).not.toHaveProperty("version")
  expect(payload).toMatchObject({
    defaultChannels: ["in_app"],
    variableSchema: { name: { default: "Reader", description: "Preserved", example: "Alex" } },
    contentFormat: "markdown",
    enabled: false,
  })
})
test("required fields, API limits and translation keys are validated before saving", () => {
  for (const field of ["name", "code", "category", "titleTemplate", "contentTemplate"] as const)
    expect(() => buildTemplatePayload({ ...form(), [field]: " " })).toThrow("formInvalid")
  expect(() => buildTemplatePayload({ ...form(), titleTemplate: "x".repeat(513) })).toThrow("formInvalid")
  expect(() => buildTemplatePayload({ ...form(), contentTemplate: "x".repeat(20001) })).toThrow("formInvalid")
  expect(() =>
    buildTemplatePayload({ ...form(), contentMode: "i18n", titleTemplate: "bad key", contentTemplate: "notice.body" }),
  ).toThrow("i18nInvalid")
  expect(
    buildTemplatePayload({
      ...form(),
      contentMode: "i18n",
      titleTemplate: "notice.title",
      contentTemplate: "notice.body",
    }),
  ).toMatchObject({ contentMode: "i18n" })
})
test("undeclared and unbalanced raw placeholders block saving, while preview-only limitations do not", () => {
  expect(() => buildTemplatePayload({ ...form(), titleTemplate: "{unknown}" })).toThrow("undeclared")
  expect(() => buildTemplatePayload({ ...form(), titleTemplate: "{name" })).toThrow("invalidFormat")
  expect(buildTemplatePayload({ ...form(), titleTemplate: "{name!r}" })).toMatchObject({ titleTemplate: "{name!r}" })
  expect(buildTemplatePayload({ ...form(), variables: [row("name")] })).toMatchObject({ variableSchema: { name: {} } })
})
test("variable insertion replaces the remembered selection and returns the restored caret position", () => {
  expect(insertTemplateVariable("Hello WORLD!", { start: 6, end: 11 }, "name")).toEqual({
    value: "Hello {name}!",
    cursor: 12,
  })
})

test("JSON editor text remains authoritative, blocks invalid syntax and preserves advanced schema properties", () => {
  const value = {
    ...form(),
    titleTemplate: "Count {count}",
    variables: [],
    schemaJson: '{"count":{"type":"integer","required":true,"example":0,"default":4,"minimum":0}}',
  }
  expect(buildTemplatePayload(value)).toMatchObject({
    variableSchema: { count: { type: "integer", required: true, example: 0, default: 4, minimum: 0 } },
  })
  expect(() => buildTemplatePayload({ ...value, schemaJson: "{" })).toThrow("schemaInvalid")
})

test("unchanged implicit example types survive JSON and table roundtrips, while explicit edits use the selected type", () => {
  const schema = { count: { example: 0, default: 5 }, flag: { example: false } }
  const rows = templateSchemaRows(schema)
  expect(templateRowsSchema(rows)).toEqual(schema)
  expect(
    buildTemplatePayload({ ...form(), titleTemplate: "Count {count}", schemaJson: JSON.stringify(schema) }),
  ).toMatchObject({ variableSchema: schema })
  expect(templateRowsSchema([{ ...rows[0], example: "1" }])).toEqual({ count: { example: "1", default: 5 } })
})

test("object and array examples are rejected rather than silently cleared, and can be corrected in the table", () => {
  for (const example of [{ bad: true }, [true]]) {
    const schema = { flag: { type: "boolean", example } }
    expect(() =>
      buildTemplatePayload({ ...form(), titleTemplate: "Flag {flag}", schemaJson: JSON.stringify(schema) }),
    ).toThrow("schemaInvalid")
    const rows = templateSchemaRows(schema)
    expect(() => templateRowsSchema(rows)).toThrow("schemaInvalid")
    expect(templateRowsSchema([{ ...rows[0], example: "false" }])).toEqual({
      flag: { type: "boolean", example: false },
    })
  }
})

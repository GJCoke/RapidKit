import { describe, expect, it } from "vitest"
import {
  parseVariableSchema,
  schemaToRows,
  rowsToSchema,
  previewTemplate,
} from "../../src/views/notification/manage/templates/modules/template-editor"

describe("notification template variable editor", () => {
  it("persists examples alongside existing rules and reloads them", () => {
    const schema = { username: { type: "string", required: true, description: "Display name" } }
    const rows = schemaToRows(schema)
    rows[0]!.example = "张三"
    const saved = rowsToSchema(rows)
    expect(saved).toEqual({ username: { ...schema.username, example: "张三" } })
    expect(schemaToRows(saved)[0]!.example).toBe("张三")
    expect(schema.username).not.toHaveProperty("example")
  })

  it("stores typed examples, preserves zero/false and accepts cleared optional samples", () => {
    const rows = schemaToRows({
      count: { type: "integer", example: 0 },
      ok: { type: "boolean", example: false },
      amount: { type: "number", example: 2.5 },
    })
    expect(rows.map((row) => row.example)).toEqual(["0", "false", "2.5"])
    expect(rowsToSchema(rows)).toEqual({
      count: { type: "integer", example: 0 },
      ok: { type: "boolean", example: false },
      amount: { type: "number", example: 2.5 },
    })
    rows[0]!.example = ""
    expect(schemaToRows(rowsToSchema(rows))[0]!.example).toBe("")
    rows[0]!.example = "1.5"
    expect(() => rowsToSchema(rows)).toThrow()
  })

  it("uses JSON examples as the source of truth and supports legacy examples", () => {
    const previous = schemaToRows({ username: { type: "string", example: "旧值" } })
    const next = schemaToRows({ username: { type: "string", example: "新值" } }, previous)
    expect(next[0]!.example).toBe("新值")
    expect(next[0]!.id).toBe(previous[0]!.id)
    expect(schemaToRows({ username: {} }, next)[0]!.example).toBe("")
    const legacy = schemaToRows({ flag: { type: "boolean", examples: [false] } })
    expect(legacy[0]!.example).toBe("false")
    legacy[0]!.example = ""
    expect(schemaToRows(rowsToSchema(legacy))[0]!.example).toBe("")
  })

  it("rejects malformed schemas and unsupported backend types", () => {
    for (const text of ["", " ", "[]", '{"name":null}', '{"name":[]}', '{"name":{"type":"object"}}', "{"]) {
      expect(() => parseVariableSchema(text)).toThrow()
    }
    expect(parseVariableSchema('{"username":{}}')).toEqual({ username: {} })
  })

  it("preserves existing schema names exactly when saving an unrelated edit", () => {
    const schema = { " user ": { type: "string", required: true, description: "Keep exact contract" } }
    expect(rowsToSchema(schemaToRows(schema))).toEqual(schema)
  })

  it("does not silently overwrite duplicate or empty variable names", () => {
    const rows = schemaToRows({ username: { type: "string" } })
    expect(() => rowsToSchema([...rows, { ...rows[0]! }])).toThrow()
    expect(() => rowsToSchema([{ ...rows[0]!, name: " " }])).toThrow()
  })

  it("treats special property names as data", () => {
    const schema = parseVariableSchema('{"__proto__":{"type":"string"}}')
    const rows = schemaToRows(schema)
    rows[0]!.example = "safe"
    const result = rowsToSchema(rows)
    expect(Object.hasOwn(result, "__proto__")).toBe(true)
    expect(previewTemplate("{__proto__}", rows).text).toBe("safe")
    expect(previewTemplate("{toString}", []).issues[0]?.kind).toBe("undeclared")
  })

  it("renders simple placeholders and escaped literal braces without recursively substituting values", () => {
    const rows = schemaToRows({ username: { type: "string", required: true } })
    rows[0]!.example = "{other}"
    expect(previewTemplate("你好，{username}。{{保留花括号}}", rows)).toEqual({
      text: "你好，{other}。{保留花括号}",
      issues: [],
    })
  })

  it("reports missing samples and type mismatches without pretending preview succeeded", () => {
    const rows = schemaToRows({ count: { type: "integer", required: true } })
    expect(previewTemplate("完成 {count} 项", rows).issues[0]?.kind).toBe("missingExample")
    rows[0]!.example = "1.5"
    expect(previewTemplate("完成 {count} 项", rows).issues[0]?.kind).toBe("invalidExample")
    rows[0]!.example = "0"
    expect(previewTemplate("完成 {count} 项", rows)).toEqual({ text: "完成 0 项", issues: [] })
  })

  it("validates boolean and numeric example types", () => {
    const rows = schemaToRows({ ok: { type: "boolean" }, amount: { type: "number" } })
    rows[0]!.example = "false"
    rows[1]!.example = "2.5"
    expect(previewTemplate("{ok}: {amount}", rows)).toEqual({ text: "False: 2.5", issues: [] })
    rows[0]!.example = "yes"
    rows[1]!.example = "Infinity"
    expect(previewTemplate("{ok}: {amount}", rows).issues).toHaveLength(2)
  })

  it("clearly reports unsupported format expressions and broken braces", () => {
    expect(previewTemplate("{user.name}", []).issues[0]?.kind).toBe("unsupportedFormat")
    expect(previewTemplate("{count:02d}", []).issues[0]?.kind).toBe("unsupportedFormat")
    expect(previewTemplate("{count:0{width}d}", []).issues).toEqual([
      { kind: "unsupportedFormat", name: "{count:0{width}d}" },
    ])
    expect(previewTemplate("{username", []).issues[0]?.kind).toBe("invalidFormat")
    expect(previewTemplate("username}", []).issues[0]?.kind).toBe("invalidFormat")
  })
})

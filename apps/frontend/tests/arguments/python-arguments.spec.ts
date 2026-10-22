import { describe, expect, it } from "vitest"
import {
  decodeArguments,
  encodeArguments,
  formatPython,
  formatPythonCall,
} from "../../src/components/common/python-arguments-editor/arguments"

describe("Python arguments", () => {
  it("round trips nested values without coercing strings", () => {
    const value = { args: ["10", 10, true, null, [false, { label: "报告" }]], kwargs: { options: { limit: 2 } } }
    const rows = decodeArguments(value)
    expect(encodeArguments(rows.args, rows.kwargs)).toEqual(value)
  })
  it("rejects empty and duplicate keyword names", () => {
    expect(() => encodeArguments([], [{ key: " ", type: "string", value: "" }])).toThrow()
    expect(() =>
      encodeArguments(
        [],
        [
          { key: "x", type: "none", value: "" },
          { key: "x", type: "none", value: "" },
        ],
      ),
    ).toThrow()
  })
  it.each(["", "abc", "Infinity", "0x10", "9007199254740993"])("rejects invalid number %s", (value) => {
    expect(() => encodeArguments([{ type: "number", value }], [])).toThrow()
  })
  it.each(['{"x":1e999}', "[9007199254740993]", "{broken}"])("rejects invalid JSON %s", (value) => {
    expect(() => encodeArguments([{ type: "json", value }], [])).toThrow()
  })
  it("preserves special object keys", () => {
    const result = encodeArguments([], [{ key: "__proto__", type: "string", value: "safe" }])
    expect(Object.hasOwn(result.kwargs, "__proto__")).toBe(true)
    expect(JSON.stringify(result.kwargs)).toBe('{"__proto__":"safe"}')
  })
  it("formats Python booleans, None and nested objects", () => {
    expect(formatPython([true, null, { enabled: false }])).toBe('[True, None, {"enabled": False}]')
    expect(formatPython("line\nnext")).toBe('"line\\nnext"')
  })
})

describe("expanded call preview", () => {
  it("puts each argument on its own line even for short calls", () => {
    expect(formatPythonCall("test", { args: [1], kwargs: { label: 2 } })).toBe("test(\n  1,\n  label=2,\n)")
    expect(formatPythonCall("test", { args: [1], kwargs: {} })).toBe("test(\n  1,\n)")
    expect(formatPythonCall("test", { args: [], kwargs: { enabled: false, result: null } })).toBe(
      "test(\n  enabled=False,\n  result=None,\n)",
    )
  })
  it("gives every positional and keyword argument its own line", () => {
    const preview = formatPythonCall("jobs.run", {
      args: ["report.csv", 10],
      kwargs: { verbose: true, options: { limit: 2 } },
    })
    expect(preview).toContain('  "report.csv",\n  10,')
    expect(preview).toContain("  verbose=True,")
    expect(preview).toContain('    "limit": 2,')
    expect(preview).toContain("  options={\n")
    expect(preview).toMatch(/^jobs.run\(\n/)
    expect(preview).not.toContain("  *[\n")
    expect(preview).not.toContain("  **{\n")
  })
  it("renders empty args and kwargs without placeholder values", () => {
    expect(formatPythonCall("task", { args: [], kwargs: {} })).toBe("task()")
  })
  it("uses multiple lines when a simple call is too long", () => {
    const text = "a".repeat(100)
    expect(formatPythonCall("test", { args: [text], kwargs: { label: 2 } })).toBe(`test(\n  "${text}",\n  label=2,\n)`)
  })
  it("preserves special keys and Python reserved words without generating invalid syntax", () => {
    expect(formatPythonCall("test", { args: [1], kwargs: { "not-valid": 2, class: 3, label: 4 } })).toBe(
      'test(\n  1,\n  **{\n    "not-valid": 2,\n  },\n  **{\n    "class": 3,\n  },\n  label=4,\n)',
    )
  })
  it("expands Unicode identifiers while preserving names changed by Python normalization", () => {
    expect(formatPythonCall("test", { args: [], kwargs: { 参数: 2, ｌａｂｅｌ: 3, match: true } })).toBe(
      'test(\n  参数=2,\n  **{\n    "ｌａｂｅｌ": 3,\n  },\n  match=True,\n)',
    )
  })
  it("locates a malformed value among multiple arguments", () => {
    try {
      encodeArguments(
        [
          { type: "string", value: "ok" },
          { type: "json", value: "{" },
        ],
        [],
      )
      throw new Error("expected invalid input")
    } catch (error) {
      expect(error).toMatchObject({ code: "json", group: "args", index: 1 })
    }
  })
})

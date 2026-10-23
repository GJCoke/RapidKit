import { expect, test } from "vitest"
import {
  ArgumentError,
  encodeArguments,
  decodeArguments,
  formatPython,
  formatPythonCall,
} from "@/shared/python-arguments/arguments"
test("all five editor types encode values without changing order, whitespace or keyword names", () => {
  expect(
    encodeArguments(
      [
        { type: "string", value: "  x  " },
        { type: "number", value: "1.5e2" },
        { type: "boolean", value: "false" },
        { type: "none", value: "ignored" },
        { type: "json", value: '{"nested":[null,true,2]}' },
      ],
      [{ key: " x ", type: "string", value: "y" }],
    ),
  ).toEqual({ args: ["  x  ", 150, false, null, { nested: [null, true, 2] }], kwargs: { " x ": "y" } })
})
test("numeric syntax and nested JSON reject infinities and integers outside safe precision", () => {
  for (const value of ["", "+1", "01", "0x10", "Infinity", "NaN", "1e309", "9007199254740992"]) {
    expect(() => encodeArguments([{ type: "number", value }], [])).toThrow(ArgumentError)
  }
  expect(() => encodeArguments([{ type: "json", value: '{"nested":[9007199254740992]}' }], [])).toThrow(ArgumentError)
  expect(encodeArguments([{ type: "number", value: "-0.25e-2" }], []).args).toEqual([-0.0025])
})
test("errors identify the offending group and row and never silently reuse a previous valid payload", () => {
  for (const [args, kwargs, code, group, index] of [
    [[{ type: "boolean", value: "True" }], [], "boolean", "args", 0],
    [[], [{ key: " ", type: "string", value: "x" }], "key", "kwargs", 0],
    [
      [],
      [
        { key: "a", type: "none", value: "" },
        { key: "a", type: "none", value: "" },
      ],
      "duplicate",
      "kwargs",
      1,
    ],
    [
      [
        { type: "none", value: "" },
        { type: "json", value: "{" },
      ],
      [],
      "json",
      "args",
      1,
    ],
  ] as const) {
    try {
      encodeArguments([...args], [...kwargs])
      expect.fail("invalid arguments must fail")
    } catch (error) {
      expect(error).toMatchObject({ code, group, index })
    }
  }
})
test("decoded payloads round-trip nested values and preserve prototype-like keyword names as own data", () => {
  const value = {
      args: ["x", 1, true, null, [false, { nested: "z" }]],
      kwargs: Object.fromEntries([
        ["__proto__", { safe: true }],
        ["class", false],
      ]),
    },
    rows = decodeArguments(value)
  expect(encodeArguments(rows.args, rows.kwargs)).toEqual(value)
  expect(Object.hasOwn(encodeArguments(rows.args, rows.kwargs).kwargs, "__proto__")).toBe(true)
})
test("Python preview uses literals, multiline collections and unpacking for reserved or normalized keyword names", () => {
  expect(formatPython([true, false, null, { a: "x" }])).toBe('[True, False, None, {"a": "x"}]')
  expect(formatPythonCall("job", { args: [], kwargs: {} })).toBe("job()")
  const code = formatPythonCall("job", { args: [[1, null]], kwargs: { 正常: true, class: 2, "bad-key": false, K: 3 } })
  expect(code).toContain("正常=True")
  expect(code).toContain('**{\n    "class": 2,\n  }')
  expect(code).toContain('"bad-key": False')
  expect(code).toContain('"K": 3')
  expect(code).toContain("None,")
})

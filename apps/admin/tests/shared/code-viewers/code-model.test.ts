import { expect, test } from "vitest"
import { serializeJson, tokenizeCode } from "@/shared/code-viewers/code-model"
import { safeFilename } from "@/shared/code-viewers/text-actions"
test("JSON viewing serializes actual values and never reparses encoded strings", () => {
  expect(serializeJson('{"x":true}')).toEqual({ valid: true, code: '"{\\"x\\":true}"' })
  expect(serializeJson({ a: [null, false, 1, "x"] })).toEqual({
    valid: true,
    code: JSON.stringify({ a: [null, false, 1, "x"] }, null, 2),
  })
  expect(serializeJson(null)).toEqual({ valid: true, code: "null" })
})
test("JSON rejects partial or transformed serialization, nonfinite values, cycles and unsupported objects", () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  for (const value of [
    undefined,
    { a: undefined },
    [Infinity],
    NaN,
    BigInt(1),
    () => 0,
    Symbol("x"),
    new Date(),
    cyclic,
    { toJSON: () => "hidden" },
  ])
    expect(serializeJson(value)).toEqual({ valid: false, code: "" })
  const shared = { a: 1 }
  expect(serializeJson([shared, shared]).valid).toBe(true)
})
test("code tokens preserve every character and treat markup as plain text, with language-specific literals", () => {
  for (const [language, source] of [
    ["json", '{"x":"<script>alert(1)</script>","a":true,"n":-1.5e2}'],
    ["python", 'job(正常=True, key=None, value="<b>")'],
  ] as const) {
    const tokens = tokenizeCode(source, language)
    expect(tokens.map((token) => token.text).join("")).toBe(source)
    expect(tokens.some((token) => token.kind === "keyword")).toBe(true)
    expect(tokens.some((token) => token.kind === "property")).toBe(true)
  }
})
test("download names remain plain filenames while retaining readable Unicode names", () => {
  expect(safeFilename("../logs\\danger:\u0000name.json", "data.json")).toBe("..logsdangername.json")
  expect(safeFilename("..", "data.json")).toBe("data.json")
  expect(safeFilename("结果-日志.json", "data.json")).toBe("结果-日志.json")
})

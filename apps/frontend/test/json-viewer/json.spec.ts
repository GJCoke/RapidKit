import { describe, expect, it } from "vitest"
import { serializeJson } from "../../src/components/common/json-viewer/json"

describe("JSON value serialization", () => {
  it("rejects unsupported original values before toJSON can replace them", () => {
    let invoked = false
    const replacement = {
      hidden: 1n,
      toJSON() {
        invoked = true
        return null
      },
    }
    for (const value of [new Date(NaN), { date: new Date(NaN) }, new Date("2026-10-08"), replacement])
      expect(serializeJson(value)).toEqual({ valid: false, code: "" })
    expect(invoked).toBe(false)
  })
  it("does not silently replace collections with empty objects", () => {
    for (const value of [new Map([["key", "value"]]), new Set([1]), /pattern/])
      expect(serializeJson(value)).toEqual({ valid: false, code: "" })
  })
  it.each([
    [0, "0"],
    [false, "false"],
    ["", '""'],
    [null, "null"],
    [[], "[]"],
    [{}, "{}"],
  ])("preserves primitive and empty values: %s", (value, code) => {
    expect(serializeJson(value)).toEqual({ valid: true, code })
  })
  it("preserves JSON-looking strings as strings", () => {
    expect(serializeJson('{"ok":true}')).toEqual({ valid: true, code: '"{\\"ok\\":true}"' })
  })
  it("formats nested data without mutating it", () => {
    const value = { ok: false, items: [0, ""] }
    expect(serializeJson(value).code).toBe('{\n  "ok": false,\n  "items": [\n    0,\n    ""\n  ]\n}')
    expect(value).toEqual({ ok: false, items: [0, ""] })
  })
  it("rejects unsupported values rather than silently dropping or changing them", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    for (const value of [
      undefined,
      NaN,
      Infinity,
      1n,
      Symbol("x"),
      () => 1,
      circular,
      { missing: undefined },
      [undefined],
      { count: NaN },
    ]) {
      expect(serializeJson(value)).toEqual({ valid: false, code: "" })
    }
  })
})

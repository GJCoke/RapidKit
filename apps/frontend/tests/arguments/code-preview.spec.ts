import { describe, expect, it } from "vitest"
import { tokenizeCode } from "../../src/components/common/python-arguments-editor/code-tokens"

describe("code preview highlighting", () => {
  it("preserves all source characters, including escaped strings and indentation", () => {
    const source = '  "text": "<script>\\n\\\"hello\\\"",\n  "count": 12'
    expect(
      tokenizeCode(source, "json")
        .map((token) => token.text)
        .join(""),
    ).toBe(source)
  })
  it("highlights Python literals and JSON keys", () => {
    expect(
      tokenizeCode('True, None, False, "True"', "python")
        .filter((token) => token.kind === "keyword")
        .map((token) => token.text),
    ).toEqual(["True", "None", "False"])
    expect(
      tokenizeCode('"count": 12, "name": "value"', "json")
        .filter((token) => token.kind === "property")
        .map((token) => token.text),
    ).toEqual(['"count"', '"name"'])
  })
  it("highlights expanded keyword arguments without matching names inside strings", () => {
    const code = 'test(1, label=2, 参数=True, text="label=2")'
    const tokens = tokenizeCode(code, "python")
    expect(tokens.map((token) => token.text).join("")).toBe(code)
    expect(tokens.filter((token) => token.kind === "property").map((token) => token.text)).toEqual([
      "label",
      "参数",
      "text",
    ])
    expect(tokens.filter((token) => token.kind === "string").map((token) => token.text)).toEqual(['"label=2"'])
  })
})

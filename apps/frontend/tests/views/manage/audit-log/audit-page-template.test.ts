import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { parse, compileTemplate } from "vue/compiler-sfc"

it("compiles the audit page and its clear-filters handler", () => {
  const source = readFileSync(new URL("../../../../src/views/manage/audit-log/index.vue", import.meta.url), "utf8")
  const parsed = parse(source)
  expect(parsed.errors).toEqual([])
  const result = compileTemplate({
    source: parsed.descriptor.template!.content,
    id: "audit-page",
    filename: "index.vue",
  })
  expect(result.errors).toEqual([])
})

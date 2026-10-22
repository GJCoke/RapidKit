import { readFileSync } from "node:fs"
import { compileTemplate, parse } from "vue/compiler-sfc"
import { expect, it } from "vitest"
it("compiles the task page controls through the Vue template compiler", () => {
  const filename = new URL("../../src/views/queue/task/index.vue", import.meta.url)
  const { descriptor } = parse(readFileSync(filename, "utf8"))
  const result = compileTemplate({ source: descriptor.template!.content, filename: filename.pathname, id: "task-page" })
  expect(result.errors).toEqual([])
})

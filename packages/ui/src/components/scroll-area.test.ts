import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./scroll-area.tsx", import.meta.url), "utf8")

test("ScrollArea uses the official base-nova Base UI primitive", () => {
  assert.match(source, /from "@base-ui\/react\/scroll-area"/)
  assert.doesNotMatch(source, /radix-ui/)
  assert.match(source, /data-horizontal:h-2\.5/)
  assert.match(source, /data-vertical:w-2\.5/)
  assert.match(source, /ScrollAreaPrimitive\.Corner/)
})

test("ScrollArea keeps the shared public component exports", () => {
  assert.match(source, /export \{ ScrollArea, ScrollBar \}/)
})

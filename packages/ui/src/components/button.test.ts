import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./button.tsx", import.meta.url), "utf8")

test("button variants match the current base-nova size baseline", () => {
  assert.match(source, /group\/button/)
  assert.match(source, /h-8 gap-1\.5 px-2\.5 has-data-\[icon=inline-end\]:pr-2/)
  assert.match(source, /sm:\s*"h-7 gap-1 .*px-2\.5/)
  assert.match(source, /lg:\s*"h-9 gap-1\.5 px-2\.5/)
  assert.match(source, /icon:\s*"size-8"/)
})

test("button uses the Base UI primitive without a Radix compatibility adapter", () => {
  assert.match(source, /@base-ui\/react\/button/)
  assert.doesNotMatch(source, /asChild/)
  assert.doesNotMatch(source, /@radix-ui/)
})

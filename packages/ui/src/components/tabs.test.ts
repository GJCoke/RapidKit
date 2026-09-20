import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("./tabs.tsx", import.meta.url), "utf8")

test("tabs styles follow the Base UI data-orientation contract", () => {
  assert.match(source, /data-\[orientation=horizontal\]:flex-col/)
  assert.match(source, /group-data-\[orientation=horizontal\]\/tabs:h-8/)
  assert.match(source, /group-data-\[orientation=vertical\]\/tabs:flex-col/)
  assert.doesNotMatch(source, /data-horizontal:/)
  assert.doesNotMatch(source, /data-vertical:/)
})

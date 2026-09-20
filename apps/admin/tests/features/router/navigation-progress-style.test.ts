import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const styles = await readFile(new URL("../../../src/styles/globals.css", import.meta.url), "utf8")

test("the progress root keeps its stacking level while fading over the sidebar", () => {
  assert.match(styles, /#nprogress \{[^}]*position: fixed;[^}]*z-index: 1031;/)
  assert.doesNotMatch(styles, /#nprogress \.bar \{[^}]*z-index:/)
})

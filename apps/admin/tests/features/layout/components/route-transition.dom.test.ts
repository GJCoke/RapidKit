import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("navigation animation starts before paint and stays on the compositor", async () => {
  const source = await readFile(new URL("../../../../src/features/layout/components/route-transition.tsx", import.meta.url), "utf8")
  const styles = await readFile(new URL("../../../../src/styles/globals.css", import.meta.url), "utf8")

  assert.match(source, /useLayoutEffect\(\(\) => \{\s*dispatch\(\{ type: "navigate"/)
  assert.match(styles, /\.route-fade-slide-exit[\s\S]*will-change: transform, opacity/)
  assert.match(styles, /\.route-fade-slide-enter[\s\S]*will-change: transform, opacity/)
})

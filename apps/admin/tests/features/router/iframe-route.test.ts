import assert from "node:assert/strict"
import { test } from "vitest"

import { resolveIframeSource } from "@/features/router/iframe-route"

test("accepts safe iframe sources and rejects unsafe sources", () => {
  assert.equal(resolveIframeSource("https://example.com/embed"), "https://example.com/embed")
  assert.equal(resolveIframeSource("javascript:alert(1)"), null)
  assert.equal(resolveIframeSource(undefined), null)
})

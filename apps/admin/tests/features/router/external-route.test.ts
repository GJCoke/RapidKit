import assert from "node:assert/strict"
import { test } from "vitest"

import { openExternalRoute } from "@/features/router/external-route"

test("opens safe external routes with isolation features", () => {
  const calls: unknown[][] = []
  const opened = openExternalRoute("https://example.com/docs", {
    open: (...args) => {
      calls.push(args)
      return null
    },
  })
  assert.equal(opened, true)
  assert.deepEqual(calls, [["https://example.com/docs", "_blank", "noopener,noreferrer"]])
})

test("does not open unsafe external routes", () => {
  let called = false
  assert.equal(
    openExternalRoute("javascript:alert(1)", {
      open: () => {
        called = true
        return null
      },
    }),
    false,
  )
  assert.equal(called, false)
})

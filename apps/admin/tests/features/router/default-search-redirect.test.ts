import assert from "node:assert/strict"
import { test } from "vitest"

import { resolveDefaultSearchRedirect } from "@/features/router/default-search-redirect"

test("redirects only when defaults add missing query values", () => {
  assert.equal(
    resolveDefaultSearchRedirect("/users", "?page=2", "#form", "?mode=list&page=1"),
    "/users?mode=list&page=2#form",
  )
  assert.equal(resolveDefaultSearchRedirect("/users", "?mode=list&page=2", "#form", "?mode=list&page=1"), null)
  assert.equal(resolveDefaultSearchRedirect("/users", "", "", ""), null)
})

import assert from "node:assert/strict"
import { test } from "vitest"

import { canonicalizePathSearch, joinRoutePath, mergeDefaultSearch, parseSafeExternalUrl } from "@/features/router/route-url"

test("normalizes nested route paths", () => {
  assert.equal(joinRoutePath("/manage", "user"), "/manage/user")
  assert.equal(joinRoutePath("/manage/", "/manage/role/"), "/manage/role")
  assert.equal(joinRoutePath("/", "home"), "/home")
})

test("merges default query deterministically and keeps explicit values", () => {
  assert.equal(
    mergeDefaultSearch("?page=2", [
      { key: "page", value: "1" },
      { key: "mode", value: "list" },
    ]),
    "?mode=list&page=2",
  )
  assert.equal(canonicalizePathSearch("/users/", "?z=2&a=1"), "/users?a=1&z=2")
})

test("allows only http and https external urls", () => {
  assert.equal(parseSafeExternalUrl("https://example.com/docs")?.protocol, "https:")
  assert.equal(parseSafeExternalUrl("http://example.com")?.protocol, "http:")
  assert.equal(parseSafeExternalUrl("javascript:alert(1)"), null)
  assert.equal(parseSafeExternalUrl("data:text/html,hello"), null)
  assert.equal(parseSafeExternalUrl("/relative"), null)
})

import assert from "node:assert/strict"
import test from "node:test"
import { resolveRouteLoadState } from "./route-state"

test("FlatResponse errors produce a retry state while preserving the current URL", () => {
  const location = { pathname: "/manage/user", search: "?page=2", hash: "#details" }
  assert.deepEqual(
    resolveRouteLoadState({ token: "token", isLoading: false, isError: false, response: { data: null, error: new Error("backend") }, location }),
    { kind: "error", returnTo: "/manage/user?page=2#details" },
  )
})

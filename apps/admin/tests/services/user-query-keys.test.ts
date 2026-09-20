import assert from "node:assert/strict"
import { test } from "vitest"
import { userQueryKeys } from "@/services/user-query-keys"

test("user query keys are scoped by account and normalized search params", () => {
  const token = "account-token"

  assert.deepEqual(userQueryKeys.root(token), ["users", token])
  assert.deepEqual(userQueryKeys.list(token, { page: 2, pageSize: 20, keyword: "Ada" }), [
    "users",
    token,
    "list",
    { keyword: "Ada", page: 2, pageSize: 20 },
  ])
  assert.deepEqual(userQueryKeys.detail(token, "user-1"), ["users", token, "detail", "user-1"])
})

test("user option keys remain separate from paginated list keys", () => {
  assert.deepEqual(userQueryKeys.roles("token"), ["users", "token", "options", "roles"])
  assert.deepEqual(userQueryKeys.departments("token"), ["users", "token", "options", "departments"])
})

import assert from "node:assert/strict"
import { test } from "vitest"

import { resolveAuthErrorCodes } from "@/services/auth-error-codes"

test("auth error codes parse comma-separated environment values", () => {
  assert.deepEqual(
    resolveAuthErrorCodes({
      VITE_SERVICE_EXPIRED_TOKEN_CODES: "14002, 14012",
      VITE_SERVICE_LOGOUT_CODES: "14003,14008",
    }),
    {
      expiredTokenCodes: new Set(["14002", "14012"]),
      logoutCodes: new Set(["14003", "14008"]),
    },
  )
})

test("auth error codes use backend protocol defaults for missing values", () => {
  assert.deepEqual(resolveAuthErrorCodes({}), {
    expiredTokenCodes: new Set(["14002"]),
    logoutCodes: new Set(["14003", "14008"]),
  })
})

test("auth error codes ignore empty entries and duplicates", () => {
  assert.deepEqual(
    resolveAuthErrorCodes({
      VITE_SERVICE_EXPIRED_TOKEN_CODES: "14002,,14002, ",
      VITE_SERVICE_LOGOUT_CODES: " 14003, 14008,14003",
    }),
    {
      expiredTokenCodes: new Set(["14002"]),
      logoutCodes: new Set(["14003", "14008"]),
    },
  )
})

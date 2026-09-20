import assert from "node:assert/strict"
import { test } from "vitest"
import { normalizeRequestError } from "@/services/request-error"

const messages = {
  network: "Network unavailable",
  server: "Service unavailable",
  unknown: "Request failed",
}

test("backend failures preserve the backend message", () => {
  assert.deepEqual(
    normalizeRequestError(
      { code: "BACKEND_ERROR", response: { status: 400, data: { code: 15001, message: "Invalid input" } } },
      messages,
    ),
    { kind: "business", code: "15001", message: "Invalid input" },
  )
})

test("transport and server failures use localized fallback messages", () => {
  assert.deepEqual(normalizeRequestError({ code: "ERR_NETWORK" }, messages), {
    kind: "network",
    code: "ERR_NETWORK",
    message: "Network unavailable",
  })
  assert.deepEqual(normalizeRequestError({ response: { status: 503 } }, messages), {
    kind: "server",
    code: "503",
    message: "Service unavailable",
  })
})

test("unknown failures use the generic localized fallback", () => {
  assert.deepEqual(normalizeRequestError(new Error("internal detail"), messages), {
    kind: "unknown",
    code: "UNKNOWN",
    message: "Request failed",
  })
})

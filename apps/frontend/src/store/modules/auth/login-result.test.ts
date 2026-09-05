import { describe, expect, it } from "vitest"
import { getLoginCooldown } from "./login-result"

describe("getLoginCooldown", () => {
  it("returns a positive integer for the cooldown error", () => {
    expect(getLoginCooldown({ code: 14010, data: { retryAfterSeconds: 287 } })).toBe(287)
    expect(getLoginCooldown({ code: "14010", data: { retryAfterSeconds: 2.2 } })).toBe(3)
  })

  it("falls back to one second for malformed cooldown data", () => {
    expect(getLoginCooldown({ code: 14010, data: null })).toBe(1)
    expect(getLoginCooldown({ code: 14010, data: { retryAfterSeconds: -2 } })).toBe(1)
    expect(getLoginCooldown({ code: 14010, data: { retryAfterSeconds: "invalid" } })).toBe(1)
  })

  it("ignores ordinary errors", () => {
    expect(getLoginCooldown({ code: 14001, data: { retryAfterSeconds: 287 } })).toBeNull()
    expect(getLoginCooldown(null)).toBeNull()
  })
})

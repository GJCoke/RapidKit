import { describe, expect, it } from "vitest"
import { canImpersonate } from "./eligibility"

describe("impersonation entry", () => {
  const actor = { id: "admin", isAdmin: true }
  const target = { id: "target", isAdmin: false, status: "1" }
  it("allows an enabled non-admin target", () => expect(canImpersonate(actor, target, false)).toBe(true))
  it.each([
    [{ ...actor, isAdmin: false }, target, false],
    [actor, { ...target, id: "admin" }, false],
    [actor, { ...target, isAdmin: true }, false],
    [actor, { ...target, status: "2" }, false],
    [actor, { ...target, status: "3" }, false],
    [actor, target, true],
    [{ ...actor, id: "" }, target, false],
  ] as const)("hides a forbidden entry", (a, b, active) => expect(canImpersonate(a, b, active)).toBe(false))
})

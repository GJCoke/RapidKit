import { expect, test } from "vitest"
import {
  createAccountPasswordSchema,
  createRecoveryEmailSchema,
  formatCooldown,
  getLoginCooldown,
  resolveLoginModule,
} from "@/features/auth/account-model"

test("only real account modules are selected and unknown template routes return to password login", () => {
  for (const value of ["pwd-login", "reset-pwd", "set-password", "reset-password"])
    expect(resolveLoginModule(value)).toBe(value)
  for (const value of [undefined, "", "register", "code-login", "bind-wechat", "unknown"])
    expect(resolveLoginModule(value)).toBe("pwd-login")
})
test("backend account-lock metadata is rounded safely and unrelated errors have no cooldown", () => {
  const error = (code: unknown, retryAfterSeconds?: unknown) => ({
    response: { data: { code, data: { retryAfterSeconds } } },
  })
  expect(getLoginCooldown(error(14010, 60.1))).toBe(61)
  expect(getLoginCooldown(error("14010", "3600"))).toBe(3600)
  for (const value of [undefined, null, 0, -1, "wrong", Infinity, {}, true])
    expect(getLoginCooldown(error(14010, value))).toBe(1)
  expect(getLoginCooldown(error(14001, 60))).toBeNull()
  expect(getLoginCooldown(new Error("offline"))).toBeNull()
  expect(getLoginCooldown(null)).toBeNull()
})
test("cooldown formatting retains hours and rounds positive fractions", () => {
  expect(formatCooldown(0)).toBe("00:00")
  expect(formatCooldown(-2)).toBe("00:00")
  expect(formatCooldown(60.1)).toBe("01:01")
  expect(formatCooldown(3661)).toBe("01:01:01")
})
const messages = { required: "required", invalid: "invalid", confirmRequired: "confirm required", mismatch: "mismatch" }
test("account password forms apply the source word-password rule and exact confirmation", () => {
  const schema = createAccountPasswordSchema(messages)
  expect(schema.safeParse({ password: "", confirmPassword: "" }).success).toBe(false)
  expect(schema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false)
  expect(schema.safeParse({ password: "bad!123", confirmPassword: "bad!123" }).success).toBe(false)
  expect(schema.safeParse({ password: "Valid_123", confirmPassword: "different" }).success).toBe(false)
  expect(schema.parse({ password: "Valid_123", confirmPassword: "Valid_123" })).toEqual({
    password: "Valid_123",
    confirmPassword: "Valid_123",
  })
})
test("recovery email is trimmed and invalid or empty input cannot issue a request", () => {
  const schema = createRecoveryEmailSchema(messages)
  expect(schema.safeParse({ email: " " }).success).toBe(false)
  expect(schema.safeParse({ email: "invalid" }).success).toBe(false)
  expect(schema.parse({ email: " owner@example.test " })).toEqual({ email: "owner@example.test" })
})

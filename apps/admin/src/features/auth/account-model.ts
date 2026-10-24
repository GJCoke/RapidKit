import { z } from "zod"

export const accountPasswordPattern = /^\w{6,18}$/
const modules = ["pwd-login", "reset-pwd", "set-password", "reset-password"] as const
export type LoginModule = (typeof modules)[number]
export function resolveLoginModule(value?: string): LoginModule {
  return modules.find((module) => module === value) ?? "pwd-login"
}
const cooldownErrorSchema = z.object({
  response: z.object({
    data: z.object({
      code: z.union([z.string(), z.number()]),
      data: z.object({ retryAfterSeconds: z.unknown() }).nullish(),
    }),
  }),
})
export function getLoginCooldown(error: unknown): number | null {
  const parsed = cooldownErrorSchema.safeParse(error)
  if (!parsed.success || String(parsed.data.response.data.code) !== "14010") return null
  const value = parsed.data.response.data.data?.retryAfterSeconds
  const seconds = typeof value === "string" || typeof value === "number" ? Number(value) : NaN
  return Number.isFinite(seconds) && seconds >= 1 ? Math.ceil(seconds) : 1
}
export function formatCooldown(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds)),
    hours = Math.floor(total / 3600)
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const remainder = String(total % 60).padStart(2, "0")
  return hours ? `${String(hours).padStart(2, "0")}:${minutes}:${remainder}` : `${minutes}:${remainder}`
}
interface PasswordMessages {
  required: string
  invalid: string
  confirmRequired: string
  mismatch: string
}
export function createAccountPasswordSchema(messages: PasswordMessages) {
  return z
    .object({
      password: z
        .string()
        .min(1, messages.required)
        .refine((value) => !value || accountPasswordPattern.test(value), messages.invalid),
      confirmPassword: z.string().min(1, messages.confirmRequired),
    })
    .refine((value) => !value.confirmPassword || value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: messages.mismatch,
    })
}
export function createRecoveryEmailSchema(messages: Pick<PasswordMessages, "required" | "invalid">) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, messages.required)
      .refine((value) => !value || z.string().email().safeParse(value).success, messages.invalid),
  })
}

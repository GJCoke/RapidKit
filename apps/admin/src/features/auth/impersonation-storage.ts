import { z } from "zod"
import type { ImpersonationCreated } from "@/services/api/impersonation"

const subjectSchema = z.object({ id: z.string().min(1), name: z.string(), username: z.string() })
const sessionSchema = z.object({
  sessionId: z.string().min(1),
  accessToken: z.string().min(1),
  expiresAt: z.string(),
  subject: subjectSchema,
})
const actorSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string(), returnPath: z.string() })
function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    return schema.parse(JSON.parse(localStorage.getItem(key) || "null"))
  } catch {
    return null
  }
}
export function readImpersonation() {
  return read("impersonation", sessionSchema)
}
export function hasImpersonationStorage() {
  return localStorage.getItem("impersonation") !== null || localStorage.getItem("impersonator") !== null
}
export function getCredentials() {
  // The complete subject record is the atomic identity switch, including between storage events in other tabs.
  if (localStorage.getItem("impersonation") !== null) {
    return { accessToken: readImpersonation()?.accessToken || "", refreshToken: "" }
  }
  return {
    accessToken: localStorage.getItem("accessToken") || "",
    refreshToken: localStorage.getItem("refreshToken") || "",
  }
}
function safeReturnPath(path: string) {
  const unsafe = [...path].some(
    (character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  )
  return path.startsWith("/") && !path.startsWith("//") && !unsafe ? path : "/"
}
export function beginImpersonation(created: ImpersonationCreated, returnPath: string) {
  if (hasImpersonationStorage()) throw new Error("Nested impersonation is not supported")
  const credentials = getCredentials()
  if (!credentials.accessToken) throw new Error("Missing administrator credentials")
  const subject = sessionSchema.parse(created)
  localStorage.setItem("impersonator", JSON.stringify({ ...credentials, returnPath: safeReturnPath(returnPath) }))
  localStorage.setItem("impersonation", JSON.stringify(subject))
  localStorage.setItem("accessToken", subject.accessToken)
  localStorage.removeItem("refreshToken")
}
export function restoreImpersonator(): string | null {
  if (!hasImpersonationStorage()) return null
  const actor = read("impersonator", actorSchema)
  if (actor) {
    localStorage.setItem("accessToken", actor.accessToken)
    if (actor.refreshToken) localStorage.setItem("refreshToken", actor.refreshToken)
    else localStorage.removeItem("refreshToken")
  } else {
    localStorage.removeItem("accessToken")
    localStorage.removeItem("refreshToken")
  }
  localStorage.removeItem("impersonation")
  localStorage.removeItem("impersonator")
  return safeReturnPath(actor?.returnPath || "/")
}
export function updateImpersonation(snapshot: {
  sessionId: string
  expiresAt: string
  subject: z.infer<typeof subjectSchema>
}) {
  const current = readImpersonation()
  if (!current || current.sessionId !== snapshot.sessionId || current.subject.id !== snapshot.subject.id) return
  localStorage.setItem("impersonation", JSON.stringify({ ...current, ...snapshot }))
}
export function clearIdentityStorage() {
  localStorage.removeItem("accessToken")
  localStorage.removeItem("refreshToken")
  localStorage.removeItem("impersonation")
  localStorage.removeItem("impersonator")
}

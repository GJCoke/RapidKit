import { z } from "zod"
export function parseDebugPayload(text: string): { success: true; data: unknown } | { success: false } {
  try {
    return { success: true, data: JSON.parse(text) }
  } catch {
    return { success: false }
  }
}
export function formatDebugData(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
const authObjectSchema = z.record(z.unknown())
export const debugConnectionInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("socketDebug.invalidUrl")
    .refine((value) => /^(https?|wss?):/.test(value), "socketDebug.invalidUrl"),
  path: z.string().trim().min(1, "socketDebug.requiredPath"),
  namespace: z.string().trim(),
  auth: z.string().refine((text) => {
    const result = parseDebugPayload(text)
    return result.success && authObjectSchema.safeParse(result.data).success
  }, "socketDebug.invalidAuth"),
})
export const debugConnectionSchema = debugConnectionInputSchema.transform(({ url, namespace, auth, path }) => {
  const endpoint = new URL(url)
  if (namespace && namespace !== "/")
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${namespace.replace(/^\//, "")}`
  const payload = parseDebugPayload(auth)
  return { url: endpoint.toString(), path, auth: authObjectSchema.parse(payload.success ? payload.data : undefined) }
})
export type DebugConnectionInput = z.input<typeof debugConnectionInputSchema>
export type DebugConnection = z.output<typeof debugConnectionSchema>
export type DebugLog = {
  id: number
  type: "info" | "error" | "send" | "receive"
  time: number
  event?: string
  data?: unknown
  message?: { key: "connected" | "disconnected" | "connectionError" | "emitError"; value: string }
}

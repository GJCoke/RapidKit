export const LOGIN_COOLDOWN_CODE = "14010"

export type LoginResult =
  | { kind: "success" }
  | { kind: "failure" }
  | { kind: "cooldown"; retryAfterSeconds: number }

type BackendErrorEnvelope = {
  code?: unknown
  data?: { retryAfterSeconds?: unknown } | null
}

export function getLoginCooldown(responseData: unknown): number | null {
  if (!responseData || typeof responseData !== "object") return null

  const envelope = responseData as BackendErrorEnvelope
  if (String(envelope.code ?? "") !== LOGIN_COOLDOWN_CODE) return null

  const seconds = Number(envelope.data?.retryAfterSeconds)
  return Number.isFinite(seconds) && seconds >= 1 ? Math.ceil(seconds) : 1
}

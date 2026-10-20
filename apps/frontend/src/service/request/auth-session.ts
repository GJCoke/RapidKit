import { localStg } from "@/utils/storage"

let observedIdentity = ""
let session = 0
let logoutSession: number | null = null

export function setLogoutSession(value: number | null) {
  logoutSession = value
}

export function isLoggingOut(value = getAuthSession()) {
  return logoutSession === value
}

function credentialIdentity() {
  const impersonation = localStg.get("impersonation")
  if (impersonation) return `impersonation:${impersonation.sessionId}`
  return `normal:${localStg.get("refreshToken") || localStg.get("token") || ""}`
}

export function getAuthSession() {
  const identity = credentialIdentity()
  if (identity !== observedIdentity) {
    observedIdentity = identity
    session++
  }
  return session
}

/** An accepted ordinary token rotation keeps its logical identity generation. */
export function recordTokenRotation(refreshToken: string) {
  if (!localStg.get("impersonation")) observedIdentity = `normal:${refreshToken}`
}

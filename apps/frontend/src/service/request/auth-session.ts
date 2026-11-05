import { localStg } from "@/utils/storage"
import { resetDiagnostics } from "@/utils/diagnostics"

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
  const identity = tokenIdentity(localStg.get("token"))
  if (identity) return `normal:${identity.sub}:${normalSessionId(identity)}`
  return `normal:${localStg.get("refreshToken") || localStg.get("token") || ""}`
}

function tokenIdentity(token: string | null): { sub: string; jti: string } | null {
  if (!token) return null
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const { sub, jti } = JSON.parse(atob(payload))
    return typeof sub === "string" && sub && typeof jti === "string" && jti ? { sub, jti } : null
  } catch {
    return null
  }
}

function normalSessionId(identity: { sub: string; jti: string }) {
  const rotation = localStg.get("tokenRotation")
  return rotation?.userId === identity.sub &&
    (rotation.tokenId === identity.jti || rotation.previousTokenId === identity.jti)
    ? rotation.sessionId
    : identity.jti
}

export function getAuthSession() {
  const identity = credentialIdentity()
  if (identity !== observedIdentity) {
    observedIdentity = identity
    session++
    resetDiagnostics()
  }
  return session
}

/** Publish the login lineage before replacing credentials, so other tabs keep their generation. */
export function recordTokenRotation(refreshToken: string, accessToken: string) {
  if (localStg.get("impersonation")) return
  const previous = tokenIdentity(localStg.get("token"))
  const next = tokenIdentity(accessToken)
  if (previous && next && previous.sub === next.sub) {
    const sessionId = normalSessionId(previous)
    localStg.set("tokenRotation", { userId: previous.sub, sessionId, previousTokenId: previous.jti, tokenId: next.jti })
    observedIdentity = `normal:${previous.sub}:${sessionId}`
  } else {
    observedIdentity = `normal:${refreshToken}`
  }
}

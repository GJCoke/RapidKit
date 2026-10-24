import { getCredentials, readImpersonation } from "@/features/auth/impersonation-storage"

let observedIdentity = ""
let session = 0

/** Token rotation preserves the session; externally replaced credentials start another one. */
export function getAuthSession() {
  const credentials = getCredentials()
  const impersonation = readImpersonation()
  const identity = impersonation
    ? `impersonation:${impersonation.sessionId}`
    : `auth:${credentials.refreshToken || credentials.accessToken}`
  if (identity !== observedIdentity) {
    observedIdentity = identity
    session++
  }
  return session
}

/** Called synchronously after this client accepts a successful rotation. */
export function recordTokenRotation(refreshToken: string) {
  if (!readImpersonation()) observedIdentity = `auth:${refreshToken}`
}

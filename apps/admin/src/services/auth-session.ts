let observedRefreshToken = ""
let session = 0

/** Token rotation preserves the session; externally replaced credentials start another one. */
export function getAuthSession() {
  const refreshToken = localStorage.getItem("refreshToken") || ""
  if (refreshToken !== observedRefreshToken) {
    observedRefreshToken = refreshToken
    session++
  }
  return session
}

/** Called synchronously after this client accepts a successful rotation. */
export function recordTokenRotation(refreshToken: string) {
  observedRefreshToken = refreshToken
}

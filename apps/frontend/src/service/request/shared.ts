import { useAuthStore } from "@/store/modules/auth"
import { localStg } from "@/utils/storage"
import { createLogger } from "@/utils/logger"
import { fetchRefreshToken } from "../api"
import { getAuthSession, isLoggingOut, recordTokenRotation } from "./auth-session"
import type { RequestInstanceState } from "./type"

const logger = createLogger("auth-refresh")

export function getAuthorization() {
  const token = localStg.get("token")
  return token ? `Bearer ${token}` : null
}

/** refresh token */
async function handleRefreshToken(session: number) {
  if (localStg.get("impersonation") || getAuthSession() !== session) return false
  const { resetStore, syncAccessToken } = useAuthStore()

  const rToken = localStg.get("refreshToken")
  try {
    if (rToken) {
      const { error, data } = await fetchRefreshToken(rToken)
      // A logout or another login may have happened while the refresh was pending.
      if (getAuthSession() !== session || localStg.get("impersonation")) return false
      if (!error && data?.accessToken && data?.refreshToken) {
        localStg.set("token", data.accessToken)
        localStg.set("refreshToken", data.refreshToken)
        recordTokenRotation(data.refreshToken)
        syncAccessToken(data.accessToken)
        return true
      }
    }
  } catch {
    if (getAuthSession() !== session || localStg.get("impersonation")) return false
  }

  await resetStore()
  return false
}

async function refreshWithBrowserLock(refreshToken: string, refresh: () => Promise<boolean>) {
  // Different logins must never wait for an old identity's pending request.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refreshToken))
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return navigator.locks.request(`rapidkit-access-token-refresh:${key}`, refresh)
}

export function handleExpiredRequest(state: RequestInstanceState, forLogout = false) {
  if (isLoggingOut() && !forLogout) return Promise.resolve(false)
  if (localStg.get("impersonation"))
    return useAuthStore()
      .stopImpersonation()
      .then(() => false)
  const session = getAuthSession()
  if (!state.refreshTokenPromise || state.refreshTokenSession !== session) {
    state.refreshTokenWaiters = 0
    logger.debug("Token refresh started")
    const token = localStg.get("token")
    const refresh = () => {
      // Another tab's credential change is handled by the existing identity reload.
      if (getAuthSession() !== session || localStg.get("token") !== token) return Promise.resolve(false)
      return handleRefreshToken(session)
    }
    const pending = globalThis.navigator?.locks
      ? refreshWithBrowserLock(localStg.get("refreshToken") || "", refresh)
      : refresh()
    const promise = pending
      .then((success) => {
        if (state.refreshTokenPromise === promise && getAuthSession() === session) {
          logger.debug(success ? "Token refresh succeeded" : "Token refresh failed", {
            waiting_requests: state.refreshTokenWaiters,
          })
        }
        return success
      })
      .finally(() => {
        if (state.refreshTokenPromise === promise) {
          state.refreshTokenPromise = null
          state.refreshTokenWaiters = 0
        }
      })
    state.refreshTokenSession = session
    state.refreshTokenPromise = promise
  }
  state.refreshTokenWaiters = (state.refreshTokenWaiters || 0) + 1
  logger.debug("Token refresh waiting", { waiting_requests: state.refreshTokenWaiters })
  return state.refreshTokenPromise
}

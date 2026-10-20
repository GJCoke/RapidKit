import { useAuthStore } from "@/store/modules/auth"
import { localStg } from "@/utils/storage"
import { fetchRefreshToken } from "../api"
import { getAuthSession, isLoggingOut, recordTokenRotation } from "./auth-session"
import type { RequestInstanceState } from "./type"

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
    const token = localStg.get("token")
    const refresh = () => {
      // Another tab's credential change is handled by the existing identity reload.
      if (getAuthSession() !== session || localStg.get("token") !== token) return Promise.resolve(false)
      return handleRefreshToken(session)
    }
    const pending = globalThis.navigator?.locks
      ? refreshWithBrowserLock(localStg.get("refreshToken") || "", refresh)
      : refresh()
    const promise = pending.finally(() => {
      if (state.refreshTokenPromise === promise) state.refreshTokenPromise = null
    })
    state.refreshTokenSession = session
    state.refreshTokenPromise = promise
  }
  return state.refreshTokenPromise
}

export function showErrorMsg(state: RequestInstanceState, message: string) {
  if (!state.errMsgStack?.length) {
    state.errMsgStack = []
  }

  const isExist = state.errMsgStack.includes(message)

  if (!isExist) {
    state.errMsgStack.push(message)

    window.$message?.error(message, {
      onLeave: () => {
        state.errMsgStack = state.errMsgStack.filter((msg) => msg !== message)

        setTimeout(() => {
          state.errMsgStack = []
        }, 5000)
      },
    })
  }
}

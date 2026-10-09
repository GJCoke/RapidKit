import { useAuthStore } from "@/store/modules/auth"
import { localStg } from "@/utils/storage"
import { fetchRefreshToken } from "../api"
import { getAuthSession, recordTokenRotation } from "./auth-session"
import type { RequestInstanceState } from "./type"

export function getAuthorization() {
  const token = localStg.get("token")
  return token ? `Bearer ${token}` : null
}

/** refresh token */
async function handleRefreshToken(session: number) {
  const { resetStore, syncAccessToken } = useAuthStore()

  const rToken = localStg.get("refreshToken")
  try {
    if (rToken) {
      const { error, data } = await fetchRefreshToken(rToken)
      // A logout or another login may have happened while the refresh was pending.
      if (getAuthSession() !== session) return false
      if (!error && data?.accessToken && data?.refreshToken) {
        localStg.set("token", data.accessToken)
        localStg.set("refreshToken", data.refreshToken)
        recordTokenRotation(data.refreshToken)
        syncAccessToken(data.accessToken)
        return true
      }
    }
  } catch {
    if (getAuthSession() !== session) return false
  }

  await resetStore()
  return false
}

export function handleExpiredRequest(state: RequestInstanceState) {
  const session = getAuthSession()
  if (!state.refreshTokenPromise || state.refreshTokenSession !== session) {
    const promise = handleRefreshToken(session).finally(() => {
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

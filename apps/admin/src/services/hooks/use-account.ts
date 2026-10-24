import { useCallback, useEffect, useRef } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { rsaEncrypt } from "@rapidkit/utils"
import { fetchPublicKey } from "@/services/api/auth"
import {
  fetchConfirmPasswordReset,
  fetchRequestPasswordReset,
  fetchSetPassword,
  fetchValidateInvite,
  fetchValidatePasswordReset,
  type PasswordResetRequest,
} from "@/services/api/account"
import { getAuthSession } from "@/services/auth-session"

export type AccountPasswordMode = "set-password" | "reset-password"
function cancelled() {
  return Object.assign(new Error("Account operation changed"), { code: "ERR_CANCELED" })
}
function useAccountScope(key: string) {
  const session = useRef(getAuthSession()).current
  const liveKey = useRef(key),
    mounted = useRef(false)
  liveKey.current = key
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return useCallback(() => {
    if (!mounted.current || session !== getAuthSession() || liveKey.current !== key) throw cancelled()
  }, [session, key])
}
export function useAccountToken(mode: AccountPasswordMode, token: string) {
  const session = getAuthSession()
  return useQuery({
    queryKey: ["account-token", session, mode, token],
    queryFn: async () => {
      if (session !== getAuthSession()) throw cancelled()
      const result = await (mode === "set-password" ? fetchValidateInvite(token) : fetchValidatePasswordReset(token))
      if (session !== getAuthSession()) throw cancelled()
      if (result.error) throw result.error
      if (!result.data) throw new Error("Account token response is empty")
      return result.data.valid
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
export function useRequestRecovery() {
  const verify = useAccountScope("recovery")
  return useMutation({
    mutationFn: async (body: PasswordResetRequest) => {
      verify()
      const result = await fetchRequestPasswordReset(body)
      verify()
      if (result.error) throw result.error
      if (result.data !== true) throw new Error("Recovery request was not accepted")
    },
  })
}
export function useAccountPassword(mode: AccountPasswordMode, token: string) {
  const verify = useAccountScope(`${mode}:${token}`)
  return useMutation({
    mutationFn: async (password: string) => {
      verify()
      if (!token) throw new Error("Account token is missing")
      const key = await fetchPublicKey()
      verify()
      if (key.error) throw key.error
      if (!key.data) throw new Error("Public key is unavailable")
      const newPassword = await rsaEncrypt(key.data, password)
      verify()
      const body = { token, newPassword }
      const result = await (mode === "set-password" ? fetchSetPassword(body) : fetchConfirmPasswordReset(body))
      verify()
      if (result.error) throw result.error
      if (result.data !== true) throw new Error("Account password was not accepted")
    },
  })
}

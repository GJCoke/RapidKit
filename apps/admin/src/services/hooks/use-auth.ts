import { useEffect } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { rsaEncrypt } from "@rapidkit/utils"
import { useAuthStore } from "@/stores/auth"
import { fetchLogin, fetchPublicKey, fetchUserInfo } from "@/services/api/auth"
import { authenticate } from "@/services/authenticate"
import { getAuthSession } from "@/services/auth-session"

export function useLogin() {
  const { setToken, setUserInfo, clearAuth } = useAuthStore()

  return useMutation({
    mutationFn: async (credentials: Parameters<typeof fetchLogin>[0]) => {
      const result = await authenticate(credentials, {
        fetchPublicKey,
        encrypt: rsaEncrypt,
        login: fetchLogin,
        setToken,
        clearAuth,
        fetchUserInfo,
        setUserInfo,
      })
      if (!result.ok) throw result.error
    },
  })
}

export function useUserInfo() {
  const { token, setUserInfo } = useAuthStore()
  const session = getAuthSession()

  const query = useQuery({
    queryKey: ["userInfo", session],
    queryFn: async () => {
      const res = await fetchUserInfo()
      if (res.error) throw res.error
      if (res.data) return res.data
      return null
    },
    enabled: !!token,
  })
  useEffect(() => {
    if (query.data && session === getAuthSession()) setUserInfo(query.data)
  }, [query.data, session, setUserInfo])
  return query
}

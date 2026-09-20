import { useMutation, useQuery } from "@tanstack/react-query"
import { rsaEncrypt } from "@rapidkit/utils"
import { useAuthStore } from "@/stores/auth"
import { fetchLogin, fetchPublicKey, fetchUserInfo } from "@/services/api/auth"
import { authenticate } from "@/services/authenticate"

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

  return useQuery({
    queryKey: ["userInfo"],
    queryFn: async () => {
      const res = await fetchUserInfo()
      if (res.data) {
        setUserInfo(res.data)
        return res.data
      }
      return null
    },
    enabled: !!token,
  })
}

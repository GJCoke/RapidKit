import { useMutation, useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { fetchLogin, fetchUserInfo } from "@/services/api/auth"

export function useLogin() {
  const { setToken, setUserInfo } = useAuthStore()

  return useMutation({
    mutationFn: fetchLogin,
    onSuccess: async (res) => {
      if (res.data) {
        const data = res.data as { accessToken: string; refreshToken: string }
        setToken(data.accessToken, data.refreshToken)
        // Fetch user info after login
        const userRes = await fetchUserInfo()
        if (userRes.data) {
          const info = userRes.data as { id: string; userName: string; realName: string; roles: string[] }
          setUserInfo(info)
        }
      }
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
        const info = res.data as { id: string; userName: string; realName: string; roles: string[] }
        setUserInfo(info)
        return info
      }
      return null
    },
    enabled: !!token,
  })
}

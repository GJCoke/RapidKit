import { useMutation, useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { fetchLogin, fetchUserInfo } from "@/services/api/auth"

export function useLogin() {
  const { setToken, setUserInfo } = useAuthStore()

  return useMutation({
    mutationFn: fetchLogin,
    onSuccess: async (res) => {
      if (res.data) {
        setToken(res.data.accessToken, res.data.refreshToken)
        // Fetch user info after login
        const userRes = await fetchUserInfo()
        if (userRes.data) {
          setUserInfo(userRes.data)
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
        setUserInfo(res.data)
        return res.data
      }
      return null
    },
    enabled: !!token,
  })
}

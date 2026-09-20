import { Navigate, Outlet, useLocation } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useUserInfo } from "@/services/hooks/use-auth"
import { AppLoading } from "@/app/app-loading"

export function AuthGuard() {
  const { token } = useAuthStore()
  const location = useLocation()
  const { isLoading } = useUserInfo()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isLoading) {
    return <AppLoading />
  }

  return <Outlet />
}

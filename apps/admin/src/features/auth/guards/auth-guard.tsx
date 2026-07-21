import { Navigate, Outlet, useLocation } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useUserInfo } from "@/services/hooks/use-auth"

export function AuthGuard() {
  const { token } = useAuthStore()
  const location = useLocation()
  const { isLoading } = useUserInfo()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return <Outlet />
}

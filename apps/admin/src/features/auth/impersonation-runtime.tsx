import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { create } from "zustand"
import { fetchUserInfo } from "@/services/api/auth"
import {
  createImpersonation,
  fetchCurrentImpersonation,
  stopImpersonation,
  type ImpersonationSnapshot,
} from "@/services/api/impersonation"
import { fetchUserRoutes } from "@/services/api/route"
import { getAuthSession } from "@/services/auth-session"
import { resetAppSockets } from "@/services/app-socket"
import { setImpersonationRecovery } from "@/services/impersonation-recovery"
import { queryClient } from "@/services/query-client"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { findRouteForPath, normalizeRoutes } from "@/features/router/route-model"
import { resolveAuthorizedHomePath } from "@/features/router/generate-routes"
import { withNotificationRoutes } from "@/features/notifications/notification-routes"
import { createImpersonationSession } from "./impersonation-session"
import { getCredentials, hasImpersonationStorage, readImpersonation } from "./impersonation-storage"

export const useImpersonationStore = create<{
  snapshot: ImpersonationSnapshot | null
  transitionSession: number | null
}>(() => ({
  snapshot: readImpersonation(),
  transitionSession: null,
}))

async function clearIdentityRuntime() {
  const session = getAuthSession()
  resetAppSockets()
  await queryClient.cancelQueries()
  if (session !== getAuthSession()) return
  queryClient.clear()
  useRouteStore.getState().clearRoutes()
  useTabStore.getState().clearTabs()
  useRouteCacheStore.getState().clear()
  const pair = getCredentials()
  useAuthStore.setState({
    token: pair.accessToken,
    refreshToken: pair.refreshToken,
    userInfo: null,
    lastLogoutReason: null,
  })
}

export const impersonationSession = createImpersonationSession({
  async create(body) {
    if (!useAuthStore.getState().userInfo?.isAdmin || hasImpersonationStorage())
      return { data: null, error: new Error("Impersonation is not available") }
    const session = getAuthSession()
    const result = await createImpersonation(body)
    if (session !== getAuthSession() || !useAuthStore.getState().userInfo?.isAdmin || hasImpersonationStorage())
      return { data: null, error: new Error("Impersonation eligibility changed") }
    return result
  },
  validate: fetchCurrentImpersonation,
  stop: stopImpersonation,
  clearRuntime: clearIdentityRuntime,
  async loadIdentity(current) {
    const session = getAuthSession()
    const [info, routes] = await Promise.all([fetchUserInfo(), fetchUserRoutes()])
    if (!current() || info.error || routes.error || !info.data || !routes.data) return false
    const subject = readImpersonation()
    if (subject && info.data.id !== subject.subject.id) return false
    queryClient.setQueryData(["userInfo", session], info.data)
    queryClient.setQueryData(["user-routes", session], routes)
    useRouteStore
      .getState()
      .replaceSnapshot(normalizeRoutes(withNotificationRoutes(routes.data.routes)), routes.data.home)
    useAuthStore.getState().setUserInfo(info.data)
    return true
  },
  async navigate(path) {
    const { snapshot, homeName } = useRouteStore.getState()
    const candidate = new URL(path, window.location.origin)
    const destination =
      path !== "/" && candidate.origin === window.location.origin && findRouteForPath(snapshot, candidate.pathname)
        ? candidate.pathname + candidate.search + candidate.hash
        : resolveAuthorizedHomePath(snapshot, homeName)
    window.history.replaceState({}, "", destination)
    window.dispatchEvent(new PopStateEvent("popstate"))
  },
  async login() {
    useAuthStore.getState().clearAuth()
    window.history.replaceState({}, "", "/login")
    window.dispatchEvent(new PopStateEvent("popstate"))
  },
  changed: (snapshot) => useImpersonationStore.setState({ snapshot }),
  busy: (busy) => useImpersonationStore.setState({ transitionSession: busy ? getAuthSession() : null }),
})

// Registered before any application child can start authenticated requests or sockets.
setImpersonationRecovery(impersonationSession.stop)

export function ImpersonationBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { snapshot, transitionSession } = useImpersonationStore()
  const token = useAuthStore((state) => state.token)
  const observedSession = useRef(getAuthSession())
  const busy = transitionSession !== null
  const [initializing, setInitializing] = useState(hasImpersonationStorage)
  useEffect(() => {
    const current = getAuthSession(),
      changed = observedSession.current !== current
    observedSession.current = current
    // Own credential switches keep their transition lease. A replacement login cancels any older work.
    if (
      (transitionSession !== null && transitionSession !== current) ||
      (snapshot && !hasImpersonationStorage()) ||
      (changed && transitionSession === null && !hasImpersonationStorage())
    ) {
      useImpersonationStore.setState({ snapshot: readImpersonation() })
      impersonationSession.cancel()
    }
  }, [token, snapshot, transitionSession])
  useEffect(() => {
    let active = true,
      revision = 0
    const bootstrap = async (external = false) => {
      const owner = ++revision
      setInitializing(true)
      try {
        if (external) await clearIdentityRuntime()
        if (!active || owner !== revision) return
        useImpersonationStore.setState({ snapshot: readImpersonation() })
        if (readImpersonation()) await impersonationSession.validate()
        else if (hasImpersonationStorage()) await impersonationSession.restore()
      } finally {
        if (active && owner === revision) setInitializing(false)
      }
    }
    void bootstrap()
    const storage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return
      if (event.key !== null && event.key !== "impersonation") return
      const next = readImpersonation()
      useImpersonationStore.setState({ snapshot: next })
      const credentials = getCredentials(),
        auth = useAuthStore.getState()
      if (credentials.accessToken === auth.token && credentials.refreshToken === auth.refreshToken) return
      impersonationSession.cancel()
      void bootstrap(true)
    }
    window.addEventListener("storage", storage)
    return () => {
      active = false
      revision++
      window.removeEventListener("storage", storage)
    }
  }, [])
  useEffect(() => {
    if (!snapshot) return
    const expire = () => {
      if (!Number.isFinite(Date.parse(snapshot.expiresAt)) || Date.parse(snapshot.expiresAt) <= Date.now())
        void impersonationSession.stop()
    }
    const validate = () => {
      if (document.visibilityState !== "hidden") {
        expire()
        void impersonationSession.validate()
      }
    }
    const timer = setInterval(expire, 1000)
    window.addEventListener("focus", validate)
    document.addEventListener("visibilitychange", validate)
    expire()
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", validate)
      document.removeEventListener("visibilitychange", validate)
    }
  }, [snapshot])
  if (busy || initializing)
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground"
      >
        {t("users.impersonation.switching")}
      </div>
    )
  return children
}

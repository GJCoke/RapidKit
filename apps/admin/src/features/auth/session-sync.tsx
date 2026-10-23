import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { fetchUserInfo, type AuthUserInfo } from "@/services/api/auth"
import { fetchUserRoutes, type UserRouteResponse } from "@/services/api/route"
import { getAuthSession, recordTokenRotation } from "@/services/auth-session"
import { openAppSocket, closeAppSocket, resetAppSockets } from "@/services/app-socket"
import { useAuthStore } from "@/stores/auth"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { findRouteForPath, findFirstNavigablePath, normalizeRoutes } from "@/features/router/route-model"
import { ConfirmActionDialog } from "@/shared/crud"
import { createPermissionSync } from "./permission-sync"

const changeSchema = z.object({
  scope: z.enum(["roles", "user", "menu"]),
  roles: z.array(z.string()).optional(),
  revision: z.number(),
})
interface Snapshot {
  info: AuthUserInfo
  routes: UserRouteResponse
}

function tokenIdentity(token: string): string | null {
  try {
    const value = z
      .object({ sub: z.string(), act: z.string().optional(), sid: z.string().optional() })
      .parse(JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"))))
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function SessionSync() {
  const token = useAuthStore((state) => state.token)
  const authenticated = Boolean(token)
  const session = getAuthSession()
  const client = useQueryClient()
  const { t } = useTranslation()
  const [confirmLeave, setConfirmLeave] = useState<{ session: number; apply: () => void } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const identityChanged = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return
      if (event.key !== null && event.key !== "refreshToken" && event.key !== "accessToken") return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const access = localStorage.getItem("accessToken") || ""
        const refresh = localStorage.getItem("refreshToken") || ""
        const old = useAuthStore.getState()
        if (access === old.token && refresh === old.refreshToken) return
        const identity = tokenIdentity(access)
        if (identity && identity === tokenIdentity(old.token)) {
          recordTokenRotation(refresh)
          useAuthStore.setState({ token: access, refreshToken: refresh })
          return
        }
        resetAppSockets()
        client.clear()
        useRouteStore.getState().clearRoutes()
        useTabStore.getState().clearTabs()
        useRouteCacheStore.getState().clear()
        useAuthStore.setState({ token: access, refreshToken: refresh, userInfo: null })
      }, 0)
    }
    window.addEventListener("storage", identityChanged)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("storage", identityChanged)
    }
  }, [client])

  useEffect(() => {
    if (!authenticated) return
    let active = true
    let pending: Snapshot | null = null
    const current = () => active && session === getAuthSession()
    const canStay = (snapshot: Snapshot) => {
      const path = window.location.pathname
      return (
        path === "/" ||
        path === "/login" ||
        path.startsWith("/login/") ||
        ["/403", "/404", "/500"].includes(path) ||
        Boolean(findRouteForPath(normalizeRoutes(snapshot.routes.routes), path))
      )
    }
    const apply = async (snapshot: Snapshot) => {
      const business = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          !["userInfo", "user-routes"].includes(String(query.queryKey[0])),
      }
      await client.cancelQueries()
      if (!current()) return
      void client.resetQueries(business)
      client.setQueryData(["userInfo", session], snapshot.info)
      client.setQueryData(["user-routes", session], { data: snapshot.routes, error: null })
      useAuthStore.getState().setUserInfo(snapshot.info)
      if (!canStay(snapshot)) {
        const routes = normalizeRoutes(snapshot.routes.routes)
        window.location.replace(
          routes.byName[snapshot.routes.home]?.fullPath ?? findFirstNavigablePath(routes.tree) ?? "/403",
        )
      }
    }
    const sync = createPermissionSync({
      getUser: () => useAuthStore.getState().userInfo ?? { isAdmin: false, roles: [] },
      refresh: async () => {
        await client.cancelQueries({
          predicate: (query) => ["userInfo", "user-routes"].includes(String(query.queryKey[0])),
        })
        if (!current()) return
        const [info, routes] = await Promise.all([fetchUserInfo(), fetchUserRoutes()])
        if (!current()) return
        if (info.error || routes.error || !info.data || !routes.data) return false
        const snapshot = { info: info.data, routes: routes.data }
        if (pending || !canStay(snapshot)) {
          pending = snapshot
          setConfirmLeave({
            session,
            apply: () => {
              if (!current() || !pending) return
              const latest = pending
              pending = null
              setConfirmLeave(null)
              void apply(latest)
            },
          })
        } else await apply(snapshot)
      },
    })
    const socket = openAppSocket("/")
    const changed = (payload: unknown) => {
      const event = changeSchema.safeParse(payload)
      if (event.success) sync.signal(event.data)
    }
    const connected = sync.trigger
    socket.on("permission:changed", changed)
    socket.on("connect", connected)
    socket.io.on("reconnect", sync.trigger)
    if (socket.connected) sync.trigger()
    return () => {
      active = false
      sync.reset()
      socket.off("permission:changed", changed)
      socket.off("connect", connected)
      socket.io.off("reconnect", sync.trigger)
      closeAppSocket(socket)
      resetAppSockets()
    }
  }, [authenticated, client, session])

  return (
    <ConfirmActionDialog
      open={authenticated && confirmLeave?.session === session}
      onOpenChange={() => {}}
      title={t("session.permissionChanged")}
      description={t("session.permissionChangedHint")}
      onConfirm={() => confirmLeave?.apply()}
      confirmLabel={t("common.confirm")}
    />
  )
}

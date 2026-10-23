import { useEffect, useState } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import { fetchTopBanner, type TopBanner } from "@/services/api/notification"
import { currentBanner } from "@/features/notifications/notification-model"
import { notificationData, notificationKeys } from "./use-notifications"

const revisionKey = (session: number) => [...notificationKeys.session(session), "banner-revision"]
const bannerKey = (session: number) => [...notificationKeys.root(session), "banner"]
interface BannerSnapshot {
  snapshot: TopBanner
  serverAnchor: number
  receivedAt: number
}
export function invalidateNotificationBanner(client: QueryClient, session: number, revision: number) {
  if (session !== getAuthSession() || !Number.isFinite(revision)) return
  client.setQueryData<number>(revisionKey(session), (previous = 0) => Math.max(previous, revision))
  void client.cancelQueries({ queryKey: bannerKey(session) }).then(() => {
    if (session === getAuthSession()) return client.invalidateQueries({ queryKey: bannerKey(session) })
  })
}
export function useNotificationBanner() {
  const token = useAuthStore((state) => state.token)
  const locale = useLocaleStore((state) => state.locale)
  const session = getAuthSession(),
    client = useQueryClient()
  const key = [...bannerKey(session), locale]
  const revision = useQuery({ queryKey: revisionKey(session), queryFn: () => 0, initialData: 0, enabled: false })
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<BannerSnapshot> => {
      const sentAt = performance.now()
      const snapshot = await notificationData(fetchTopBanner())
      const receivedAt = performance.now()
      const previous = client.getQueryData<BannerSnapshot>(key)
      const estimate = Date.parse(snapshot.serverNow) + Math.max(0, receivedAt - sentAt) / 2
      return {
        snapshot,
        receivedAt,
        serverAnchor: previous
          ? Math.max(previous.serverAnchor + receivedAt - previous.receivedAt, estimate)
          : estimate,
      }
    },
    enabled: Boolean(token),
    retry: false,
  })
  const [clock, setClock] = useState(() => performance.now())
  const data = query.data
  const now = data ? data.serverAnchor + Math.max(0, clock - data.receivedAt) : 0
  useEffect(() => {
    if (!token) return
    const timer = setInterval(() => setClock(performance.now()), 1000)
    const focus = () => {
      setClock(performance.now())
      void query.refetch()
    }
    window.addEventListener("focus", focus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", focus)
    }
  }, [Boolean(token), session, locale, query.refetch])
  useEffect(() => {
    if (!token || !data?.snapshot.nextChangeAt) return
    const delay = Date.parse(data.snapshot.nextChangeAt) - (data.serverAnchor + performance.now() - data.receivedAt)
    if (!Number.isFinite(delay)) return
    const timer = setTimeout(
      () => {
        setClock(performance.now())
        void query.refetch()
      },
      Math.min(2_147_483_647, Math.max(50, delay + 10)),
    )
    return () => clearTimeout(timer)
  }, [Boolean(token), data, query.refetch])
  return { ...query, current: token ? currentBanner(data?.snapshot, revision.data, now) : null }
}

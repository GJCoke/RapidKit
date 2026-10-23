import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import {
  fetchNotifications,
  fetchNotificationUnread,
  fetchReadNotification,
  fetchReadAllNotifications,
  fetchArchiveNotification,
  fetchDeleteNotification,
  type NotificationQuery,
  type NotificationMessage,
  type NotificationPage,
  type NotificationUnread,
} from "@/services/api/notification"
import { sanitizeNotification } from "@/features/notifications/notification-model"

export const notificationKeys = {
  root: (session: number) => ["notifications", session] as const,
  session: (session: number) => ["notification-session", session] as const,
  inboxes: (session: number) => ["notifications", session, "inbox"] as const,
  recalls: (session: number) => ["notification-session", session, "recalls"] as const,
  unread: (session: number) => ["notifications", session, "unread"] as const,
  countVersion: (session: number) => ["notifications", session, "count-version"] as const,
}
type InboxData = InfiniteData<NotificationPage, string | null>
function recallsFor(client: QueryClient, session: number) {
  return client.getQueryData<ReadonlySet<string>>(notificationKeys.recalls(session)) ?? new Set<string>()
}
function cachedMessages(client: QueryClient, session: number) {
  return client
    .getQueriesData<InboxData>({ queryKey: notificationKeys.inboxes(session) })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
}
function updateMessages(
  client: QueryClient,
  session: number,
  update: (items: NotificationMessage[], filters: NotificationQuery) => NotificationMessage[],
) {
  for (const [key, data] of client.getQueriesData<InboxData>({ queryKey: notificationKeys.inboxes(session) })) {
    if (!data) continue
    const parsed = key[4]
    const filters: NotificationQuery = typeof parsed === "object" && parsed !== null ? parsed : {}
    client.setQueryData<InboxData>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: update(page.items, filters) })),
    })
  }
}
export function receiveUnreadCount(client: QueryClient, session: number, count: number) {
  if (session !== getAuthSession()) return
  client.setQueryData<number>(notificationKeys.countVersion(session), (value = 0) => value + 1)
  client.setQueryData<NotificationUnread>(notificationKeys.unread(session), { count: Math.max(0, count) })
}
function calibrateUnread(client: QueryClient, session: number) {
  const version = client.getQueryData<number>(notificationKeys.countVersion(session)) ?? 0
  return client.cancelQueries({ queryKey: notificationKeys.unread(session) }).then(() => {
    if (
      session === getAuthSession() &&
      version === (client.getQueryData<number>(notificationKeys.countVersion(session)) ?? 0)
    )
      return client.invalidateQueries({ queryKey: notificationKeys.unread(session) })
  })
}
export function recallNotification(client: QueryClient, session: number, messageId: string) {
  if (session !== getAuthSession()) return
  const previous = recallsFor(client, session)
  if (previous.has(messageId)) return
  const unreadIds = new Set(
    cachedMessages(client, session)
      .filter((message) => message.messageId === messageId && !message.readAt && message.status !== "recalled")
      .map((message) => message.id),
  )
  const recalls = new Set([...previous, messageId])
  client.setQueryData(notificationKeys.recalls(session), recalls)
  updateMessages(client, session, (items) => items.map((message) => sanitizeNotification(message, recalls)))
  const unread = client.getQueryData<NotificationUnread>(notificationKeys.unread(session))
  if (unread) receiveUnreadCount(client, session, unread.count - unreadIds.size)
  void calibrateUnread(client, session)
}
function matchesFilters(message: NotificationMessage, filters: NotificationQuery) {
  return !(
    (filters.unreadOnly && (message.readAt || message.status === "recalled")) ||
    ((filters.archived ?? "active") === "active" && message.archivedAt) ||
    (filters.archived === "archived" && !message.archivedAt) ||
    (filters.category && message.category !== filters.category) ||
    (filters.level && message.level !== filters.level) ||
    (filters.createdFrom && Date.parse(message.createTime) < Date.parse(filters.createdFrom)) ||
    (filters.createdTo && Date.parse(message.createTime) > Date.parse(filters.createdTo))
  )
}
export function receiveNotification(client: QueryClient, session: number, message: NotificationMessage) {
  if (session !== getAuthSession()) return
  const recalls = recallsFor(client, session)
  if (message.status === "recalled") recallNotification(client, session, message.messageId)
  if (message.status === "recalled" || recalls.has(message.messageId)) return
  const fetching = {
    queryKey: notificationKeys.inboxes(session),
    fetchStatus: "fetching" as const,
  }
  const pendingKeys = client
    .getQueryCache()
    .findAll(fetching)
    .map((query) => query.queryKey)
  const canceled = pendingKeys.length ? client.cancelQueries(fetching) : undefined
  const seenKey = [...notificationKeys.root(session), "received"]
  const seen = client.getQueryData<ReadonlySet<string>>(seenKey) ?? new Set<string>()
  const duplicate = seen.has(message.id) || cachedMessages(client, session).some((item) => item.id === message.id)
  client.setQueryData(seenKey, new Set([...seen, message.id]))
  for (const [key, data] of client.getQueriesData<InboxData>({ queryKey: notificationKeys.inboxes(session) })) {
    if (!data?.pages.length) continue
    const parsed = key[4]
    const filters: NotificationQuery = typeof parsed === "object" && parsed !== null ? parsed : {}
    if (!matchesFilters(message, filters)) continue
    client.setQueryData<InboxData>(key, {
      ...data,
      pages: data.pages.map((page, index) => ({
        ...page,
        items:
          index === 0
            ? [message, ...page.items.filter((item) => item.id !== message.id)]
            : page.items.filter((item) => item.id !== message.id),
      })),
    })
  }
  if (!duplicate && !message.readAt) {
    const count = client.getQueryData<NotificationUnread>(notificationKeys.unread(session))?.count
    if (count !== undefined) receiveUnreadCount(client, session, count + 1)
    else void calibrateUnread(client, session)
  }
  if (canceled)
    void canceled.then(() => {
      if (session !== getAuthSession()) return
      for (const key of pendingKeys) void client.invalidateQueries({ queryKey: key, exact: true })
    })
}
function useScope() {
  const token = useAuthStore((state) => state.token)
  const locale = useLocaleStore((state) => state.locale)
  return { session: getAuthSession(), locale, enabled: Boolean(token) }
}
export async function notificationData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Notification response is empty")
  return result.data
}
export function useNotificationInbox(filters: Omit<NotificationQuery, "cursor" | "size">, enabled = true) {
  const scope = useScope(),
    client = useQueryClient()
  const recalls = useQuery({
    queryKey: notificationKeys.recalls(scope.session),
    queryFn: () => new Set<string>(),
    initialData: new Set<string>(),
    enabled: false,
  })
  const query = useInfiniteQuery({
    queryKey: [...notificationKeys.inboxes(scope.session), scope.locale, filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const data = await notificationData(
        fetchNotifications({ ...filters, size: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
      )
      if (scope.session === getAuthSession()) {
        for (const item of data.items)
          if (item.status === "recalled") recallNotification(client, scope.session, item.messageId)
      }
      return { ...data, items: data.items.map((item) => sanitizeNotification(item, recallsFor(client, scope.session))) }
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: scope.enabled && enabled,
    retry: false,
  })
  const merged = new Map<string, NotificationMessage>()
  for (const page of query.data?.pages ?? [])
    for (const item of page.items) merged.set(item.id, sanitizeNotification(item, recalls.data))
  const items = [...merged.values()].filter(
    (item) => !filters.unreadOnly || (!item.readAt && item.status !== "recalled"),
  )
  return { ...query, items }
}
export function useNotificationUnread() {
  const scope = useScope(),
    client = useQueryClient()
  return useQuery({
    queryKey: notificationKeys.unread(scope.session),
    queryFn: async () => {
      const version = client.getQueryData<number>(notificationKeys.countVersion(scope.session)) ?? 0
      const data = await notificationData(fetchNotificationUnread())
      return version === (client.getQueryData<number>(notificationKeys.countVersion(scope.session)) ?? 0)
        ? data
        : (client.getQueryData<NotificationUnread>(notificationKeys.unread(scope.session)) ?? data)
    },
    enabled: scope.enabled,
    retry: false,
  })
}
type NotificationAction = { type: "read" | "archive" | "delete"; id: string } | { type: "read-all" }
export function useNotificationActions() {
  const client = useQueryClient()
  useScope()
  return useMutation({
    onMutate: () => ({ session: getAuthSession() }),
    mutationFn: async (action: NotificationAction) => {
      const session = getAuthSession()
      if (!useAuthStore.getState().token) throw new Error("Authentication required")
      await client.cancelQueries({ queryKey: notificationKeys.inboxes(session) })
      if (session !== getAuthSession()) throw new Error("Notification session changed")
      if (
        action.type === "read" &&
        cachedMessages(client, session).some(
          (item) =>
            item.id === action.id && (item.status === "recalled" || recallsFor(client, session).has(item.messageId)),
        )
      )
        return { session, ignored: true }
      const result = await (action.type === "read-all"
        ? fetchReadAllNotifications()
        : action.type === "read"
          ? fetchReadNotification(action.id)
          : action.type === "archive"
            ? fetchArchiveNotification(action.id)
            : fetchDeleteNotification(action.id))
      if (result.error) throw result.error
      return { session, ignored: false }
    },
    onError: (_error, _action, context) => {
      if (!context || context.session !== getAuthSession()) return
      for (const [key, data] of client.getQueriesData<InboxData>({
        queryKey: notificationKeys.inboxes(context.session),
      }))
        if (!data) void client.invalidateQueries({ queryKey: key, exact: true })
    },
    onSuccess: async (result, action) => {
      if (result.session !== getAuthSession() || result.ignored) return
      const session = result.session
      const emptyKeys = client
        .getQueriesData<InboxData>({ queryKey: notificationKeys.inboxes(session) })
        .filter(([, data]) => !data)
        .map(([key]) => key)
      await client.cancelQueries({ queryKey: notificationKeys.inboxes(session) })
      if (session !== getAuthSession()) return
      const now = new Date().toISOString()
      updateMessages(client, session, (items) =>
        items.flatMap((item) => {
          if (action.type !== "read-all" && item.id !== action.id) return [item]
          if (action.type === "delete" || action.type === "archive") return []
          return [item.status === "recalled" ? item : { ...item, readAt: item.readAt || now }]
        }),
      )
      if (action.type === "read-all") receiveUnreadCount(client, session, 0)
      void calibrateUnread(client, session)
      if (action.type === "read-all") void client.invalidateQueries({ queryKey: notificationKeys.inboxes(session) })
      else for (const key of emptyKeys) void client.invalidateQueries({ queryKey: key, exact: true })
    },
  })
}

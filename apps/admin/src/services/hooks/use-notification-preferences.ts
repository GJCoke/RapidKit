import { useEffect, useRef, useState } from "react"
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  fetchNotificationPreferences,
  updateNotificationPreference,
  type NotificationPreferences,
} from "@/services/api/notification-preference"
export const preferenceKeys = { all: (session: number) => ["notification-preferences", session] as const }
async function preferenceData<T>(promise: Promise<{ data: T | null; error: unknown }>) {
  const result = await promise
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Preference response is empty")
  return result.data
}
export function useNotificationPreferences() {
  const token = useAuthStore((state) => state.token),
    session = useRef(getAuthSession()).current,
    client = useQueryClient(),
    alive = useRef(true),
    locks = useRef(new Set<string>())
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set())
  const key = preferenceKeys.all(session),
    mutationKey = [...key, "write"],
    active = Boolean(token) && session === getAuthSession()
  const pendingWrites = useIsMutating({ mutationKey })
  const categoryPending = (category: string) =>
    client.isMutating({
      mutationKey,
      predicate: (mutation) => {
        const variables = mutation.state.variables
        return (
          typeof variables === "object" &&
          variables !== null &&
          "category" in variables &&
          variables.category === category
        )
      },
    }) > 0
  const authorized = () => alive.current && Boolean(useAuthStore.getState().token) && session === getAuthSession()
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      void client.cancelQueries({
        queryKey: preferenceKeys.all(session),
        predicate: (query) => query.getObserversCount() === 0,
      })
    }
  }, [client, session])
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!authorized()) throw new Error("Preference session changed")
      return preferenceData(fetchNotificationPreferences())
    },
    enabled: active,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ category, enabled }: { category: string; enabled: boolean }) => {
      if (!authorized()) throw new Error("Preference session changed")
      return preferenceData(updateNotificationPreference(category, { enabled }))
    },
    onSuccess: async (data, { category }) => {
      // Permission sync or a reopened page may be reading a snapshot from before this commit.
      if (session !== getAuthSession()) return
      await client.cancelQueries({ queryKey: key, exact: true })
      if (session !== getAuthSession()) return
      const rows = client.getQueryData<NotificationPreferences>(key)
      // Committed values belong to this login even after the initiating page unmounts.
      client.setQueryData<NotificationPreferences>(key, (current) =>
        current?.map((row) => (row.category === category ? data : row)),
      )
      if (!alive.current || !rows?.some((row) => row.category === category))
        await client.invalidateQueries({ queryKey: key, exact: true })
    },
  })
  const toggle = async (category: string, enabled: boolean): Promise<boolean> => {
    if (!authorized() || locks.current.has(category) || categoryPending(category) || query.isError || query.isFetching)
      return false
    const item = client.getQueryData<NotificationPreferences>(key)?.find((row) => row.category === category)
    if (!item || !item.closable || item.reserved || item.enabled === enabled) return false
    locks.current.add(category)
    setSaving(new Set(locks.current))
    const replace = (value: boolean) =>
      client.setQueryData<NotificationPreferences>(key, (rows) =>
        rows?.map((row) => (row.category === category ? { ...row, enabled: value } : row)),
      )
    try {
      // Stop older reads before applying the optimistic choice. Other categories remain independent.
      await client.cancelQueries({ queryKey: key, exact: true })
      if (!authorized()) return false
      replace(enabled)
      await mutation.mutateAsync({ category, enabled })
      if (!authorized()) return false
      return true
    } catch {
      if (authorized()) replace(item.enabled)
      return false
    } finally {
      locks.current.delete(category)
      if (alive.current) setSaving(new Set(locks.current))
    }
  }
  return {
    items: active && !query.isError ? (query.data ?? []) : [],
    loading: active && (query.isPending || query.isFetching),
    failed: active && query.isError,
    load: () => query.refetch(),
    toggle,
    isSaving: (category: string) => saving.has(category) || (pendingWrites > 0 && categoryPending(category)),
  }
}

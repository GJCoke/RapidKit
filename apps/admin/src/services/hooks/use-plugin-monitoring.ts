import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { fetchPluginList, fetchPluginDependencies, fetchPluginEvents } from "@/services/api/plugin-monitoring"
function canReadPlugins(session: number) {
  const state = useAuthStore.getState()
  return session === getAuthSession() && Boolean(state.token) && hasPermission(state.userInfo, "plugin:read")
}
function usePluginResource<T>(
  name: string,
  session: number,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<{ data: T | null; error: unknown }>,
) {
  return useQuery({
    queryKey: ["plugin-monitoring", session, name],
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      if (!canReadPlugins(session) || signal.aborted) throw new Error("Plugin monitoring session or permission changed")
      const response = await load(signal)
      if (response.error) throw response.error
      if (response.data === null) throw new Error("Plugin monitoring response is empty")
      if (!canReadPlugins(session) || signal.aborted) throw new Error("Plugin monitoring session or permission changed")
      return response.data
    },
  })
}
export function usePluginMonitoring() {
  useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current
  const read = usePermission("plugin:read") && session === getAuthSession()
  const plugins = usePluginResource("plugins", session, read, fetchPluginList)
  const graph = usePluginResource("graph", session, read, fetchPluginDependencies)
  const events = usePluginResource("events", session, read, fetchPluginEvents)
  return {
    plugins: read ? plugins.data : undefined,
    graph: read ? graph.data : undefined,
    events: read ? events.data : undefined,
    queries: { plugins, graph, events },
    loading: read && [plugins, graph, events].some((query) => query.isFetching),
    async refresh() {
      if (!canReadPlugins(session)) return
      await Promise.allSettled([plugins.refetch(), graph.refetch(), events.refetch()])
    },
  }
}

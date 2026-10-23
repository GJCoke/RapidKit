import { useQuery } from "@tanstack/react-query"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import { getAuthSession } from "@/services/auth-session"
import {
  fetchAuditActors,
  fetchAuditCatalog,
  fetchAuditDetail,
  fetchAuditLogs,
  fetchAuditTargets,
  type AuditLogQuery,
  type AuditActorsQuery,
} from "@/services/api/audit-log"
function useAuditScope() {
  const token = useAuthStore((s) => s.token)
  const locale = useLocaleStore((s) => s.locale)
  const allowed = usePermission("audit-log:read")
  return { key: ["audit-logs", getAuthSession(), locale] as const, enabled: !!token && allowed }
}
async function auditData<T>(pending: Promise<{ data: T | null; error: unknown }>) {
  const result = await pending
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Audit response is empty")
  return result.data
}
export function useAuditCatalog() {
  const scope = useAuditScope()
  return useQuery({
    queryKey: [...scope.key, "catalog"],
    queryFn: () => auditData(fetchAuditCatalog()),
    enabled: scope.enabled,
    retry: false,
  })
}
export function useAuditLogs(params: AuditLogQuery) {
  const scope = useAuditScope()
  return useQuery({
    queryKey: [...scope.key, "list", params],
    queryFn: () => auditData(fetchAuditLogs(params)),
    enabled: scope.enabled,
    retry: false,
  })
}
export function useAuditDetail(id: string) {
  const scope = useAuditScope()
  return useQuery({
    queryKey: [...scope.key, "detail", id],
    queryFn: async () => {
      const result = await fetchAuditDetail(id)
      if (result.error) throw result.error
      return result.data
    },
    enabled: scope.enabled && !!id,
    retry: false,
    staleTime: 0,
  })
}
export function useAuditActors(params: AuditActorsQuery) {
  const scope = useAuditScope()
  return useQuery({
    queryKey: [...scope.key, "actors", params],
    queryFn: () => auditData(fetchAuditActors(params)),
    enabled: scope.enabled,
    retry: false,
  })
}
export function useAuditTargets(id: string, page: number) {
  const scope = useAuditScope()
  return useQuery({
    queryKey: [...scope.key, "targets", id, page],
    queryFn: () => auditData(fetchAuditTargets(id, { page, pageSize: 20 })),
    enabled: scope.enabled,
    retry: false,
  })
}

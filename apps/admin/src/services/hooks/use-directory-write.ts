import { useRef } from "react"
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { getAuthSession } from "@/services/auth-session"
import { userQueryKeys } from "@/services/user-query-keys"
import { requireDirectoryPermission, requireDirectorySession } from "@/services/user-access"
import type { PermissionCode } from "@/typings/permission-codes"

export async function invalidateUserDirectory(client: QueryClient, session: number) {
  if (session !== getAuthSession()) return
  await Promise.all([
    client.invalidateQueries({ queryKey: userQueryKeys.root(session) }),
    client.invalidateQueries({ queryKey: ["announcement-options", session] }),
  ])
}
export function useDirectoryWrite<Variables, Data>(
  permission: PermissionCode,
  send: (variables: Variables) => Promise<{ data: Data | null; error: unknown }>,
  invalidate = true,
) {
  const session = useRef(getAuthSession()).current
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (variables: Variables) => {
      requireDirectoryPermission(permission, session)
      const result = await send(variables)
      requireDirectorySession(session)
      if (result.error) throw result.error
      if (result.data === null) throw new Error("Directory response is empty")
      return result.data
    },
    onSuccess: () => (invalidate ? invalidateUserDirectory(client, session) : undefined),
  })
}

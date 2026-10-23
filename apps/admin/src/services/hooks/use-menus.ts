import { useMutation, useQueryClient } from "@tanstack/react-query"
import { hasPermission } from "@/features/auth/permissions"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import {
  batchDeleteMenus,
  createMenu,
  deleteMenu,
  fetchMenus,
  updateMenu,
  type CreateMenuBody,
  type MenuSearchParams,
  type UpdateMenuBody,
} from "@/services/api/menu"
import { usePaginatedTable } from "@/shared/data-table"
import type { PermissionCode } from "@/typings/permission-codes"

export const menuQueryKeys = { all: (session: number) => ["menus", session] as const }
export async function unwrapMenuRequest<T>(request: Promise<{ data: T | null; error: unknown }>) {
  const result = await request
  if (result.error) throw result.error
  if (result.data === null) throw new Error("Menu response is empty")
  return result.data
}
export function requireMenuPermission(code: PermissionCode, session: number) {
  if (session !== getAuthSession()) throw new Error("Menu editor session changed")
  const state = useAuthStore.getState()
  if (!state.token || !hasPermission(state.userInfo, code)) throw new Error("Menu operation permission revoked")
}
export function useMenus(params: Omit<MenuSearchParams, "page" | "pageSize">) {
  useAuthStore((s) => s.token)
  return usePaginatedTable({
    queryKey: [...menuQueryKeys.all(getAuthSession()), params],
    queryFn: ({ page, pageSize }) => unwrapMenuRequest(fetchMenus({ ...params, page, pageSize })),
  })
}
export function useMenuMutations() {
  const client = useQueryClient()
  const session = getAuthSession()
  const invalidate = async () => {
    if (session !== getAuthSession()) return
    await Promise.all([
      client.invalidateQueries({ queryKey: menuQueryKeys.all(session) }),
      client.invalidateQueries({ queryKey: ["user-routes", session] }),
      client.invalidateQueries({ queryKey: ["constant-routes"] }),
      client.invalidateQueries({ queryKey: ["permission-menus", session] }),
    ])
  }
  const create = useMutation({
    mutationFn: (data: CreateMenuBody) => {
      requireMenuPermission("menu:create", session)
      return unwrapMenuRequest(createMenu(data))
    },
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMenuBody }) => {
      requireMenuPermission("menu:update", session)
      return unwrapMenuRequest(updateMenu(id, data))
    },
    onSuccess: invalidate,
  })
  const deletion = useMutation({
    mutationFn: (ids: string[]) => {
      requireMenuPermission("menu:delete", session)
      return ids.length === 1 ? unwrapMenuRequest(deleteMenu(ids[0])) : unwrapMenuRequest(batchDeleteMenus(ids))
    },
    onSuccess: invalidate,
  })
  return { create, update, deletion }
}

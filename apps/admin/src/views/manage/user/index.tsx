import { useMemo, useState } from "react"
import type { ColumnPinningState, RowSelectionState, VisibilityState } from "@tanstack/react-table"
import { Button, toast } from "@rapidkit/ui"
import { Can } from "@/features/auth"
import { PageHeader } from "@/features/layout/components/page-header"
import type { User } from "@/services/api/user"
import { useDeleteUsers, useResendUserInvite } from "@/services/hooks/use-user-mutations"
import { useRoleOptions } from "@/services/hooks/use-user-options"
import { useUsers } from "@/services/hooks/use-users"
import { ConfirmActionDialog } from "@/shared/crud"
import { DataTable, TableColumnSetting, TableHeaderOperation, useTableOperate } from "@/shared/data-table"
import { useAuthStore } from "@/stores/auth"
import { ChangePasswordDialog } from "./modules/change-password-dialog"
import { UserOperateDrawer } from "./modules/user-operate-drawer"
import { UserSearch, type UserFilters } from "./modules/user-search"
import { createUserColumns } from "./user-columns"

export default function UserManagementPage() {
  const currentUserId = useAuthStore((state) => state.userInfo?.id)
  const [filters, setFilters] = useState<UserFilters>({})
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [pinning, setPinning] = useState<ColumnPinningState>({ left: ["username"], right: ["actions"] })
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const users = useUsers(filters)
  const roles = useRoleOptions()
  const operate = useTableOperate<User>((row) => row.id)
  const deletion = useDeleteUsers()
  const resend = useResendUserInvite()
  const columns = useMemo(
    () =>
      createUserColumns(users.page, users.pageSize, roles.data, (user) => (
        <div className="flex flex-wrap gap-1">
          <Can permission="user:update">
            <Button variant="ghost" size="sm" onClick={() => operate.openEdit(user)}>
              编辑
            </Button>
            {user.status === "3" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending}
                onClick={() => resend.mutate(user.id, { onSuccess: () => toast.success("邀请已重新发送") })}
              >
                重发邀请
              </Button>
            )}
          </Can>
          <Can permission="user:reset-password">
            <Button variant="ghost" size="sm" onClick={() => setPasswordUser(user)}>
              改密
            </Button>
          </Can>
          <Can permission="user:delete">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteIds([user.id])}>
              删除
            </Button>
          </Can>
        </div>
      )),
    [operate.openEdit, resend.isPending, resend.mutate, users.page, users.pageSize, roles.data],
  )
  const defaultOrder = useMemo(
    () => columns.map((column) => String(column.id ?? ("accessorKey" in column ? column.accessorKey : ""))),
    [columns],
  )
  const [order, setOrder] = useState<string[]>(defaultOrder)
  const settings = columns.map((column) => ({
    id: String(column.id),
    title: column.meta?.title ?? String(column.id),
    hideable: column.meta?.hideable,
    pinnable: column.meta?.pinnable,
  }))
  const selected = Object.keys(selection).filter((id) => selection[id])
  const confirmDelete = async () => {
    await deletion.mutateAsync(deleteIds)
    toast.success("用户删除成功")
    setDeleteIds([])
    setSelection({})
    users.pageAfterDelete(Math.max(0, users.tableData.records.length - deleteIds.length))
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="用户管理" description="管理系统用户、角色和账户状态" />
      <UserSearch
        value={filters}
        onChange={(next) => {
          setFilters(next)
          users.resetPage()
        }}
      />
      <TableHeaderOperation
        leading={
          <>
            <Can permission="user:create">
              <Button onClick={operate.openAdd}>新增用户</Button>
            </Can>
            <Can permission="user:delete">
              <Button variant="destructive" disabled={!selected.length} onClick={() => setDeleteIds(selected)}>
                批量删除
              </Button>
            </Can>
          </>
        }
        refreshing={users.query.isFetching}
        onRefresh={() => void users.refresh()}
        trailing={
          <TableColumnSetting
            columns={settings}
            visibility={visibility}
            order={order}
            pinning={pinning}
            onVisibilityChange={setVisibility}
            onOrderChange={setOrder}
            onPinningChange={setPinning}
          />
        }
      />
      <DataTable<User>
        columns={columns}
        data={users.tableData.records}
        getRowId={(row) => row.id}
        pagination={{ page: users.page, pageSize: users.pageSize, total: users.tableData.total }}
        onPageChange={users.setPage}
        onPageSizeChange={users.setPageSize}
        loading={users.query.isLoading}
        error={users.query.isError}
        onRetry={() => void users.refresh()}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        columnVisibility={visibility}
        columnOrder={order}
        columnPinning={pinning}
      />
      <UserOperateDrawer
        open={operate.open}
        onOpenChange={(open) => {
          if (!open) operate.close()
        }}
        user={operate.editingRecord}
        onSuccess={operate.completeMutation}
      />
      {passwordUser && (
        <ChangePasswordDialog
          open
          onOpenChange={(open) => {
            if (!open) setPasswordUser(null)
          }}
          userId={passwordUser.id}
          isSelf={passwordUser.id === currentUserId}
        />
      )}
      <ConfirmActionDialog
        open={deleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds([])
        }}
        title={deleteIds.length > 1 ? "批量删除用户" : "删除用户"}
        description="删除后无法恢复，请确认是否继续。"
        pending={deletion.isPending}
        onConfirm={() => void confirmDelete()}
        confirmLabel="删除"
      />
    </div>
  )
}

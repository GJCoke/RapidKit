import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { hashKey } from "@tanstack/react-query"
import type { ColumnPinningState, RowSelectionState, VisibilityState } from "@tanstack/react-table"
import { Building2, MoreHorizontal } from "lucide-react"
import { Button, Checkbox, toast } from "@rapidkit/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { hasPermission, usePermission } from "@/features/auth/permissions"
import { hasImpersonationStorage } from "@/features/auth/impersonation-storage"
import { useImpersonationStore } from "@/features/auth/impersonation-runtime"
import { PageHeader } from "@/features/layout/components/page-header"
import type { User, UserSearchParams } from "@/services/api/user"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { useDeleteUsers, useResendUserInvite } from "@/services/hooks/use-user-mutations"
import { useUsers } from "@/services/hooks/use-users"
import { useDepartmentOptions } from "@/services/hooks/use-user-options"
import { ConfirmActionDialog } from "@/shared/crud"
import { DataTable, TableColumnSetting, TableHeaderOperation, useTableOperate } from "@/shared/data-table"
import { useAuthStore } from "@/stores/auth"
import { useAppStore } from "@/stores/app"
import { ChangePasswordDialog } from "./modules/change-password-dialog"
import { UserOperateDrawer } from "./modules/user-operate-drawer"
import { UserSearch, type UserFilters } from "./modules/user-search"
import { DepartmentPanel } from "./modules/department-panel"
import { createDepartmentDirectory } from "./modules/department-directory"
import { ImpersonationDialog } from "./modules/impersonation-dialog"
import { canImpersonateUser, canResetUserPassword } from "./modules/user-eligibility"
import { createUserColumns } from "./user-columns"

type Action = "edit" | "password" | "resend" | "delete" | "impersonate"
type Filters = Omit<UserSearchParams, "page" | "pageSize">
export default function UserManagementPage() {
  const { t } = useTranslation()
  const allowed = usePermission("user:read")
  return allowed ? (
    <UserWorkbench key={getAuthSession()} />
  ) : (
    <p role="alert" className="p-4 text-muted-foreground">
      {t("users.denied")}
    </p>
  )
}
function UserWorkbench() {
  const { t } = useTranslation()
  const session = useRef(getAuthSession()).current
  const actor = useAuthStore((state) => state.userInfo)
  const impersonating = Boolean(useImpersonationStore((state) => state.snapshot)) || hasImpersonationStorage()
  const isMobile = useAppStore((state) => state.isMobile)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState("all")
  const [draft, setDraft] = useState<UserFilters>({})
  const [filters, setFilters] = useState<Filters>({})
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [pinning, setPinning] = useState<ColumnPinningState>({ left: ["username"], right: ["actions"] })
  const [order, setOrder] = useState([
    "select",
    "index",
    "username",
    "email",
    "department",
    "roles",
    "status",
    "actions",
  ])
  const [passwordId, setPasswordId] = useState<string | null>(null)
  const [impersonationId, setImpersonationId] = useState<string | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [deleteFailed, setDeleteFailed] = useState(false)
  const [resendFailed, setResendFailed] = useState(false)
  const users = useUsers(filters),
    departments = useDepartmentOptions()
  const operate = useTableOperate<User>((row) => row.id)
  const deletion = useDeleteUsers(),
    resend = useResendUserInvite()
  const canCreate = usePermission("user:create"),
    canUpdate = usePermission("user:update"),
    canDelete = usePermission("user:delete"),
    canPassword = usePermission("user:reset-password"),
    canDirectory = usePermission("department:read")
  const mounted = useRef(false),
    deleteBusy = useRef(false),
    resendBusy = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = useCallback(() => mounted.current && session === getAuthSession(), [session])
  const records = users.query.isFetching ? [] : users.tableData.records
  const latestRows = useRef(records)
  latestRows.current = records
  const directory = useMemo(
    () => createDepartmentDirectory(departments.isError ? [] : (departments.data ?? []), null),
    [departments.data, departments.isError],
  )
  const passwordUser = records.find((row) => row.id === passwordId)
  const impersonationUser = records.find((row) => row.id === impersonationId)
  useEffect(() => {
    const ids = new Set(records.map((row) => row.id))
    setSelection((previous) => {
      const retained = Object.fromEntries(Object.entries(previous).filter(([id, selected]) => selected && ids.has(id)))
      return Object.keys(retained).length === Object.keys(previous).length ? previous : retained
    })
    if (passwordId && (!passwordUser || !canPassword || !canResetUserPassword(actor, passwordId, impersonating)))
      setPasswordId(null)
    if (impersonationId && (!impersonationUser || !canImpersonateUser(actor, impersonationUser, impersonating)))
      setImpersonationId(null)
    if (deleteIds.length && !deleteBusy.current && (!canDelete || deleteIds.some((id) => !ids.has(id))))
      setDeleteIds([])
    if (operate.open && !(operate.editingRecord ? canUpdate : canCreate)) operate.close()
  }, [
    records,
    passwordId,
    passwordUser,
    impersonationId,
    impersonationUser,
    actor,
    impersonating,
    canPassword,
    canDelete,
    canCreate,
    canUpdate,
    deleteIds,
    operate.open,
    operate.editingRecord,
    operate.close,
  ])
  const applyFilters = (next: Filters) => {
    const refreshCurrent = users.page === 1 && hashKey([filters]) === hashKey([next])
    setSelection({})
    setDeleteIds([])
    setFilters(next)
    users.resetPage()
    if (refreshCurrent) void users.refresh()
  }
  const selectDepartment = useCallback(
    (id: string) => {
      if (id === selectedDepartment) return
      setSelectedDepartment(id)
      setSelection({})
      setDeleteIds([])
      users.resetPage()
      setFilters({
        ...draft,
        ...(id === "all"
          ? {}
          : id === "unassigned"
            ? { unassigned: true }
            : { departmentId: id, includeChildren: true }),
      })
      setDirectoryOpen(false)
    },
    [draft, selectedDepartment, users.resetPage],
  )
  useEffect(() => {
    if (
      canDirectory &&
      departments.isSuccess &&
      departments.data &&
      selectedDepartment !== "all" &&
      selectedDepartment !== "unassigned" &&
      !directory.has(selectedDepartment)
    )
      selectDepartment("all")
  }, [canDirectory, departments.isSuccess, departments.data, directory, selectedDepartment, selectDepartment])
  const onAction = useCallback(
    async (id: string, action: Action) => {
      const row = latestRows.current.find((record) => record.id === id)
      if (!row || !current()) return
      try {
        requireDirectoryPermission("user:read", session)
        requireDirectoryPermission(
          action === "edit" || action === "resend"
            ? "user:update"
            : action === "delete"
              ? "user:delete"
              : action === "password"
                ? "user:reset-password"
                : "user:read",
          session,
        )
        if (action === "edit") operate.openEdit(row)
        else if (action === "delete") {
          setDeleteFailed(false)
          setDeleteIds([id])
        } else if (action === "password") {
          if (canResetUserPassword(useAuthStore.getState().userInfo, id, hasImpersonationStorage())) setPasswordId(id)
        } else if (action === "impersonate") {
          if (canImpersonateUser(useAuthStore.getState().userInfo, row, hasImpersonationStorage()))
            setImpersonationId(id)
        } else if (row.status === "3" && !resendBusy.current) {
          requireDirectoryPermission("user:create", session)
          resendBusy.current = true
          setResendFailed(false)
          try {
            await resend.mutateAsync(id)
            if (current()) {
              setSelection({})
              toast.success(t("users.inviteResent"))
            }
          } catch {
            if (current()) setResendFailed(true)
          } finally {
            resendBusy.current = false
          }
        }
      } catch {
        /* Revocation or an old row makes the action ineligible. */
      }
    },
    [current, operate.openEdit, resend.mutateAsync, session, t],
  )
  const rowActions = useCallback(
    (row: User) => <UserActions user={row} onAction={onAction} pending={resend.isPending} />,
    [onAction, resend.isPending],
  )
  const columns = useMemo(
    () =>
      createUserColumns({
        page: users.page,
        pageSize: users.pageSize,
        t,
        directory,
        actions: canUpdate || canDelete || canPassword || actor?.isAdmin ? rowActions : undefined,
      }),
    [users.page, users.pageSize, t, directory, canUpdate, canDelete, canPassword, actor?.isAdmin, rowActions],
  )
  const settings = columns.map((column) => ({
    id: String(column.id),
    title: column.meta?.title ?? String(column.id),
    hideable: column.meta?.hideable,
    pinnable: column.meta?.pinnable,
  }))
  const selected = Object.keys(selection).filter((id) => selection[id] && records.some((row) => row.id === id))
  const confirmDelete = async () => {
    if (deleteBusy.current || !deleteIds.length || !current()) return
    const ids = [...deleteIds],
      remaining = latestRows.current.length - ids.length
    try {
      requireDirectoryPermission("user:delete", session)
    } catch {
      setDeleteIds([])
      return
    }
    if (ids.some((id) => !latestRows.current.some((row) => row.id === id))) {
      setDeleteIds([])
      setSelection({})
      return
    }
    deleteBusy.current = true
    setDeleteFailed(false)
    try {
      await deletion.mutateAsync(ids)
      if (!current()) return
      requireDirectoryPermission("user:delete", session)
      setDeleteIds([])
      setSelection({})
      users.pageAfterDelete(Math.max(0, remaining))
      toast.success(t("users.deleted"))
    } catch {
      if (current()) setDeleteFailed(true)
    } finally {
      deleteBusy.current = false
    }
  }
  const refresh = () => {
    setSelection({})
    setDeleteIds([])
    void users.refresh()
  }
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("users.title")} description={t("users.description")} />
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        {canDirectory && (!isMobile || directoryOpen) && (
          <aside
            aria-label={t("users.directory.title")}
            className="min-w-0 shrink-0 rounded-xl border bg-card p-3 lg:w-64"
          >
            <DepartmentPanel selectedId={selectedDepartment} onSelect={selectDepartment} onChanged={refresh} />
          </aside>
        )}
        <div className="grid min-w-0 flex-1 content-start gap-4">
          <div className="space-y-1">
            <h2 className="font-medium">
              {selectedDepartment === "all"
                ? t("users.directory.allUsers")
                : selectedDepartment === "unassigned"
                  ? t("users.directory.unassigned")
                  : directory.get(selectedDepartment)?.department.name ||
                    t("users.currentDepartment", { id: selectedDepartment })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("users.directory.members", { count: users.tableData.total })}
            </p>
            {directory.has(selectedDepartment) && (
              <p aria-label={t("users.selectedDepartmentPath")} className="break-words text-xs text-muted-foreground">
                {directory
                  .get(selectedDepartment)
                  ?.path.map((entry) => entry.name)
                  .join(" / ")}
              </p>
            )}
          </div>
          {isMobile && canDirectory && (
            <Button
              variant="outline"
              className="justify-self-start"
              aria-expanded={directoryOpen}
              onClick={() => setDirectoryOpen((open) => !open)}
            >
              <Building2 className="size-4" />
              {t(directoryOpen ? "users.hideDepartments" : "users.showDepartments")}
            </Button>
          )}
          <UserSearch
            value={draft}
            onChange={setDraft}
            onSearch={() => applyFilters({ ...filters, ...draft, keyword: draft.keyword, status: draft.status })}
            onReset={() => {
              setDraft({})
              applyFilters({ ...filters, keyword: undefined, status: undefined })
            }}
          />
          {selectedDepartment !== "all" && selectedDepartment !== "unassigned" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.includeChildren !== false}
                onCheckedChange={(checked) => applyFilters({ ...filters, includeChildren: checked === true })}
              />
              {t("users.includeChildren")}
            </label>
          )}
          <TableHeaderOperation
            leading={
              <>
                {canCreate && (
                  <Button
                    onClick={() => {
                      try {
                        requireDirectoryPermission("user:create", session)
                        operate.openAdd()
                      } catch {}
                    }}
                  >
                    {t("users.addTitle")}
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="destructive"
                    disabled={!selected.length || deletion.isPending}
                    onClick={() => {
                      setDeleteFailed(false)
                      setDeleteIds(selected)
                    }}
                  >
                    {t("users.batchDelete")}
                  </Button>
                )}
              </>
            }
            refreshing={users.query.isFetching}
            onRefresh={refresh}
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
          {resendFailed && (
            <p role="alert" className="text-sm text-destructive">
              {t("users.inviteFailed")}
            </p>
          )}
          <DataTable<User>
            columns={columns}
            data={records}
            getRowId={(row) => row.id}
            pagination={{ page: users.page, pageSize: users.pageSize, total: users.tableData.total }}
            onPageChange={(page) => {
              setSelection({})
              setDeleteIds([])
              users.setPage(page)
            }}
            onPageSizeChange={(size) => {
              setSelection({})
              setDeleteIds([])
              users.setPageSize(size)
            }}
            loading={users.query.isFetching}
            error={users.query.isError}
            onRetry={refresh}
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            columnVisibility={visibility}
            columnOrder={order}
            columnPinning={isMobile ? { left: [], right: [] } : pinning}
          />
        </div>
      </div>
      <UserOperateDrawer
        open={operate.open}
        onOpenChange={(open) => {
          if (!open) operate.close()
        }}
        user={operate.editingRecord}
        departmentId={selectedDepartment !== "all" && selectedDepartment !== "unassigned" ? selectedDepartment : null}
        onSuccess={() => {
          setSelection({})
          operate.completeMutation()
        }}
      />
      {passwordUser && (
        <ChangePasswordDialog
          open
          onOpenChange={(open) => {
            if (!open) setPasswordId(null)
          }}
          userId={passwordUser.id}
          isSelf={passwordUser.id === actor?.id}
        />
      )}
      <ImpersonationDialog
        open={Boolean(impersonationId)}
        onOpenChange={(open) => {
          if (!open) setImpersonationId(null)
        }}
        user={impersonationUser}
        departmentName={
          impersonationUser?.departmentId
            ? directory
                .get(impersonationUser.departmentId)
                ?.path.map((entry) => entry.name)
                .join(" / ")
            : undefined
        }
      />
      <ConfirmActionDialog
        open={deleteIds.length > 0 && canDelete}
        onOpenChange={(open) => {
          if (!open && !deleteBusy.current) setDeleteIds([])
        }}
        title={t(deleteIds.length > 1 ? "users.batchDelete" : "users.deleteTitle")}
        description={t(deleteFailed ? "users.deleteFailed" : "users.deleteDescription", { count: deleteIds.length })}
        pending={deletion.isPending}
        onConfirm={() => void confirmDelete()}
        confirmLabel={t("common.delete")}
      />
    </div>
  )
}
function UserActions({
  user,
  onAction,
  pending,
}: {
  user: User
  onAction: (id: string, action: Action) => Promise<void>
  pending: boolean
}) {
  const { t } = useTranslation()
  const actor = useAuthStore((state) => state.userInfo)
  const impersonating = Boolean(useImpersonationStore((state) => state.snapshot)) || hasImpersonationStorage()
  const canEdit = usePermission("user:update"),
    canDelete = usePermission("user:delete"),
    canPassword = usePermission("user:reset-password") && canResetUserPassword(actor, user.id, impersonating)
  const canImpersonate = canImpersonateUser(actor, user, impersonating)
  const invite = canEdit && user.status === "3"
  const canInvite = hasPermission(actor, "user:create")
  const menu = canDelete || canPassword || canImpersonate || invite
  return (
    <div className="flex items-center gap-1">
      {canEdit && (
        <Button variant="ghost" size="sm" onClick={() => void onAction(user.id, "edit")}>
          {t("common.edit")}
        </Button>
      )}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("users.rowActions", { name: user.name })}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {canPassword && (
                <DropdownMenuItem onClick={() => void onAction(user.id, "password")}>
                  {t("users.password.title")}
                </DropdownMenuItem>
              )}
              {canImpersonate && (
                <DropdownMenuItem onClick={() => void onAction(user.id, "impersonate")}>
                  {t("users.impersonation.start")}
                </DropdownMenuItem>
              )}
              {invite && (
                <DropdownMenuItem disabled={pending || !canInvite} onClick={() => void onAction(user.id, "resend")}>
                  {t("users.resendInvite")}
                </DropdownMenuItem>
              )}
              {invite && !canInvite && (
                <p className="max-w-64 px-2 py-1 text-xs text-muted-foreground">{t("users.resendRequiresCreate")}</p>
              )}
              {canDelete && (
                <DropdownMenuItem className="text-destructive" onClick={() => void onAction(user.id, "delete")}>
                  {t("common.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

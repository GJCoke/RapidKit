import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ColumnPinningState, RowSelectionState, VisibilityState } from "@tanstack/react-table"
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@rapidkit/ui"
import { useAppStore } from "@/stores/app"
import { Can, usePermission } from "@/features/auth"
import { PageHeader } from "@/features/layout/components/page-header"
import type { Role, RoleSearchParams } from "@/services/api/role"
import { useRoleMutations, useRoles } from "@/services/hooks/use-roles"
import { ConfirmActionDialog, FormField } from "@/shared/crud"
import { DataTable, TableColumnSetting, TableHeaderOperation, type DataTableColumn } from "@/shared/data-table"
import { RoleOperateDrawer } from "./modules/role-operate-drawer"
import { PermissionWorkbench } from "./modules/permission-workbench"

type Filters = Omit<RoleSearchParams, "page" | "pageSize">
export default function RoleManagementPage() {
  const { t } = useTranslation()
  const isMobile = useAppStore((state) => state.isMobile)
  const [draft, setDraft] = useState<Filters>({})
  const [filters, setFilters] = useState<Filters>({})
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [pinning, setPinning] = useState<ColumnPinningState>({ left: ["name"], right: ["actions"] })
  const [order, setOrder] = useState(["select", "index", "name", "code", "description", "status", "actions"])
  const [editing, setEditing] = useState<{ role: Role | null } | null>(null)
  const [grant, setGrant] = useState<Role | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const canCreate = usePermission("role:create"),
    canUpdate = usePermission("role:update"),
    canDelete = usePermission("role:delete"),
    canGrant = usePermission("role:grant")
  useEffect(() => {
    if (editing && !(editing.role ? canUpdate : canCreate)) setEditing(null)
    if (grant && !canGrant) setGrant(null)
    if (deleteIds.length && !canDelete) setDeleteIds([])
  }, [editing, grant, deleteIds.length, canCreate, canUpdate, canGrant, canDelete])
  const roles = useRoles(filters)
  const { deletion } = useRoleMutations()
  const columns = useMemo<DataTableColumn<Role>[]>(() => {
    const list: DataTableColumn<Role>[] = [
      {
        id: "select",
        size: 44,
        enableHiding: false,
        meta: { title: t("role.selection"), hideable: false },
        header: ({ table }) => (
          <Checkbox
            aria-label={t("role.selectPage")}
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("role.select", { name: row.original.name })}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
      },
      {
        id: "index",
        header: t("role.index"),
        size: 64,
        meta: { title: t("role.index") },
        cell: ({ row }) => (roles.page - 1) * roles.pageSize + row.index + 1,
      },
      ...(["name", "code", "description"] as const).map((key) => ({
        id: key,
        accessorKey: key,
        header: t({ name: "role.roleName", code: "role.roleCode", description: "role.roleDesc" }[key]),
        meta: {
          title: t({ name: "role.roleName", code: "role.roleCode", description: "role.roleDesc" }[key]),
          pinnable: true,
        },
      })),
      {
        id: "status",
        header: t("role.roleStatus"),
        meta: { title: t("role.roleStatus") },
        cell: ({ row }) => (
          <Badge variant={row.original.status === "1" ? "default" : "secondary"}>
            {t(
              row.original.status === "1"
                ? "role.enabled"
                : row.original.status === "2"
                  ? "role.disabled"
                  : "role.otherStatus",
              { status: row.original.status },
            )}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("role.actions"),
        size: 260,
        enableHiding: false,
        meta: { title: t("role.actions"), hideable: false, pinnable: true },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Can permission="role:grant">
              <Button variant="ghost" size="sm" onClick={() => setGrant(row.original)}>
                {t("role.permissionConfig")}
              </Button>
            </Can>
            <Can permission="role:update">
              <Button variant="ghost" size="sm" onClick={() => setEditing({ role: row.original })}>
                {t("common.edit")}
              </Button>
            </Can>
            <Can permission="role:delete">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={deletion.isPending}
                onClick={() => setDeleteIds([row.original.id])}
              >
                {t("common.delete")}
              </Button>
            </Can>
          </div>
        ),
      },
    ]
    return list.filter((column) => column.id !== "actions" || canGrant || canUpdate || canDelete)
  }, [t, roles.page, roles.pageSize, deletion.isPending, canGrant, canUpdate, canDelete])
  const statuses = [
    { value: "all", label: t("role.allStatus") },
    { value: "1", label: t("role.enabled") },
    { value: "2", label: t("role.disabled") },
  ]
  const selected = Object.keys(selection).filter((id) => selection[id])
  const apply = (next: Filters) => {
    setFilters(next)
    setSelection({})
    roles.resetPage()
  }
  const remove = async () => {
    try {
      await deletion.mutateAsync(deleteIds)
      toast.success(t("role.deleted"))
      setSelection({})
      setDeleteIds([])
      roles.pageAfterDelete(Math.max(0, roles.tableData.records.length - deleteIds.length))
    } catch {
      /* keep selection for retry */
    }
  }
  return (
    <div className="grid gap-4">
      <PageHeader title={t("role.title")} description={t("role.description")} />
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          apply(draft)
        }}
      >
        <FormField htmlFor="role-keyword" label={t("role.keyword")}>
          <Input
            id="role-keyword"
            value={draft.keyword ?? ""}
            onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
          />
        </FormField>
        <FormField label={t("role.roleStatus")}>
          <Select
            items={statuses}
            value={draft.status ?? "all"}
            onValueChange={(value) =>
              setDraft({ ...draft, status: value === "1" || value === "2" ? value : undefined })
            }
          >
            <SelectTrigger aria-label={t("role.roleStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statuses.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormField>
        <Button type="submit">{t("common.search")}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft({})
            apply({})
          }}
        >
          {t("common.reset")}
        </Button>
      </form>
      <TableHeaderOperation
        leading={
          <>
            <Can permission="role:create">
              <Button onClick={() => setEditing({ role: null })}>{t("role.addRole")}</Button>
            </Can>
            <Can permission="role:delete">
              <Button
                variant="destructive"
                disabled={!selected.length || deletion.isPending}
                onClick={() => setDeleteIds(selected)}
              >
                {t("role.batchDelete")}
              </Button>
            </Can>
          </>
        }
        refreshing={roles.query.isFetching}
        onRefresh={() => void roles.refresh()}
        trailing={
          <TableColumnSetting
            columns={columns.map((c) => ({
              id: String(c.id),
              title: c.meta?.title ?? String(c.id),
              hideable: c.meta?.hideable,
              pinnable: c.meta?.pinnable,
            }))}
            visibility={visibility}
            order={order}
            pinning={pinning}
            onVisibilityChange={setVisibility}
            onOrderChange={setOrder}
            onPinningChange={setPinning}
          />
        }
      />
      <DataTable<Role>
        columns={columns}
        data={roles.tableData.records}
        getRowId={(r) => r.id}
        pagination={{ page: roles.page, pageSize: roles.pageSize, total: roles.tableData.total }}
        onPageChange={(page) => {
          setSelection({})
          roles.setPage(page)
        }}
        onPageSizeChange={(size) => {
          setSelection({})
          roles.setPageSize(size)
        }}
        loading={roles.query.isLoading}
        error={roles.query.isError}
        onRetry={() => void roles.refresh()}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        columnVisibility={visibility}
        columnOrder={order}
        columnPinning={isMobile ? { left: [], right: [] } : pinning}
      />
      {editing && (editing.role ? canUpdate : canCreate) && (
        <RoleOperateDrawer role={editing.role} onClose={() => setEditing(null)} />
      )}
      {grant && canGrant && (
        <PermissionWorkbench key={grant.id} roleId={grant.id} roleName={grant.name} onClose={() => setGrant(null)} />
      )}
      <ConfirmActionDialog
        open={canDelete && deleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds([])
        }}
        title={t("role.deleteTitle")}
        description={t("role.deleteHint")}
        pending={deletion.isPending}
        onConfirm={() => void remove()}
        confirmLabel={t("common.delete")}
      />
    </div>
  )
}

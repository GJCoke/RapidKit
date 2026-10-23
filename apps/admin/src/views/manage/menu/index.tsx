import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { ColumnPinningState, RowSelectionState, VisibilityState } from "@tanstack/react-table"
import { Badge, Button, Checkbox, toast } from "@rapidkit/ui"
import { Can, usePermission } from "@/features/auth"
import { PageHeader } from "@/features/layout/components/page-header"
import { resolveMenuIcon } from "@/features/layout/components/sidebar/sidebar-icon"
import { useAppStore } from "@/stores/app"
import type { Menu } from "@/services/api/menu"
import { useMenuMutations, useMenus } from "@/services/hooks/use-menus"
import { ConfirmActionDialog } from "@/shared/crud"
import { DataTable, TableColumnSetting, TableHeaderOperation, type DataTableColumn } from "@/shared/data-table"
import { allMenuIds, toggleMenuSelection, flattenMenus, type MenuOperation, type MenuRow } from "./modules/menu-form"
import { MenuOperateDrawer } from "./modules/menu-operate-drawer"

export default function MenuManagementPage() {
  const { t } = useTranslation()
  const isMobile = useAppStore((s) => s.isMobile)
  const menus = useMenus({})
  const { deletion } = useMenuMutations()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [pinning, setPinning] = useState<ColumnPinningState>({ left: ["menuName"], right: ["actions"] })
  const [order, setOrder] = useState([
    "select",
    "id",
    "menuType",
    "menuName",
    "icon",
    "routeName",
    "routePath",
    "status",
    "hideInMenu",
    "parentId",
    "order",
    "actions",
  ])
  const [editing, setEditing] = useState<{ operation: MenuOperation; menu: Menu | null } | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const canCreate = usePermission("menu:create"),
    canUpdate = usePermission("menu:update"),
    canDelete = usePermission("menu:delete")
  useEffect(() => {
    if (editing && !(editing.operation === "edit" ? canUpdate : canCreate)) setEditing(null)
    if (deleteIds.length && !canDelete) setDeleteIds([])
  }, [editing, deleteIds.length, canCreate, canUpdate, canDelete])
  const rows = useMemo(() => flattenMenus(menus.tableData.records, expanded), [menus.tableData.records, expanded])
  const columns = useMemo<DataTableColumn<MenuRow>[]>(
    () => [
      {
        id: "select",
        size: 44,
        enableHiding: false,
        meta: { title: t("menu.selection"), hideable: false },
        header: () => (
          <Checkbox
            aria-label={t("menu.selectPage")}
            disabled={menus.query.isPlaceholderData}
            checked={
              allMenuIds(menus.tableData.records).length > 0 &&
              allMenuIds(menus.tableData.records).every((id) => selection[id])
            }
            indeterminate={
              allMenuIds(menus.tableData.records).some((id) => selection[id]) &&
              !allMenuIds(menus.tableData.records).every((id) => selection[id])
            }
            onCheckedChange={(v) =>
              setSelection(
                v === true ? Object.fromEntries(allMenuIds(menus.tableData.records).map((id) => [id, true])) : {},
              )
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("menu.select", { name: row.original.menuName })}
            disabled={menus.query.isPlaceholderData}
            checked={selection[row.original.id] === true}
            indeterminate={
              !selection[row.original.id] && allMenuIds(row.original.children ?? []).some((id) => selection[id])
            }
            onCheckedChange={(v) =>
              setSelection((current) => toggleMenuSelection(menus.tableData.records, current, row.original, v === true))
            }
          />
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        size: 120,
        header: t("menu.id"),
        meta: { title: t("menu.id") },
        cell: ({ row }) => (
          <span className="block max-w-28 truncate" title={row.original.id}>
            {row.original.id}
          </span>
        ),
      },
      {
        id: "menuType",
        header: t("menu.menuType"),
        size: 100,
        meta: { title: t("menu.menuType") },
        cell: ({ row }) => (
          <Badge variant={row.original.menuType === "2" ? "default" : "secondary"}>
            {t(row.original.menuType === "2" ? "menu.type.menu" : "menu.type.directory")}
          </Badge>
        ),
      },
      {
        id: "menuName",
        header: t("menu.menuName"),
        size: 220,
        meta: { title: t("menu.menuName"), pinnable: true },
        cell: ({ row }) => {
          const menu = row.original
          return (
            <div className="flex items-center gap-1" style={{ paddingInlineStart: menu.depth * 20 }}>
              {menu.children?.length ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t(expanded.has(menu.id) ? "menu.collapse" : "menu.expand", { name: menu.menuName })}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current)
                      if (next.has(menu.id)) next.delete(menu.id)
                      else next.add(menu.id)
                      return next
                    })
                  }
                >
                  {expanded.has(menu.id) ? <ChevronDown /> : <ChevronRight />}
                </Button>
              ) : (
                <span className="w-9 shrink-0" />
              )}
              <span>{menu.i18nKey ? t(menu.i18nKey, { defaultValue: menu.menuName }) : menu.menuName}</span>
            </div>
          )
        },
      },
      {
        id: "icon",
        header: t("menu.icon"),
        size: 70,
        meta: { title: t("menu.icon") },
        cell: ({ row }) => {
          const Icon = resolveMenuIcon(
            row.original.iconType === "2"
              ? { localIcon: row.original.icon ?? undefined }
              : { icon: row.original.icon ?? undefined },
          )
          return row.original.icon ? (
            <span title={row.original.icon}>
              <Icon className="size-4" aria-label={row.original.icon} />
            </span>
          ) : null
        },
      },
      ...(["routeName", "routePath"] as const).map((key) => ({
        id: key,
        accessorKey: key,
        header: t(`menu.${key}`),
        size: 180,
        meta: { title: t(`menu.${key}`), pinnable: true },
      })),
      {
        id: "status",
        header: t("menu.menuStatus"),
        size: 100,
        meta: { title: t("menu.menuStatus") },
        cell: ({ row }) => (
          <Badge variant={row.original.status === "1" ? "default" : "secondary"}>
            {t(
              row.original.status === "1"
                ? "menu.enabled"
                : row.original.status === "2"
                  ? "menu.disabled"
                  : "menu.otherStatus",
              { status: row.original.status },
            )}
          </Badge>
        ),
      },
      {
        id: "hideInMenu",
        header: t("menu.hideInMenu"),
        size: 90,
        meta: { title: t("menu.hideInMenu") },
        cell: ({ row }) => t(row.original.hideInMenu ? "menu.yes" : "menu.no"),
      },
      {
        id: "parentId",
        accessorKey: "parentId",
        header: t("menu.parentId"),
        size: 120,
        meta: { title: t("menu.parentId") },
        cell: ({ row }) => (
          <span className="block max-w-28 truncate" title={row.original.parentId ?? ""}>
            {row.original.parentId ?? "—"}
          </span>
        ),
      },
      { id: "order", accessorKey: "order", header: t("menu.order"), size: 70, meta: { title: t("menu.order") } },
      ...(canCreate || canUpdate || canDelete
        ? [
            {
              id: "actions",
              header: t("menu.actions"),
              size: 300,
              enableHiding: false,
              meta: { title: t("menu.actions"), hideable: false, pinnable: true },
              cell: ({ row }) => (
                <div className="flex flex-wrap gap-1">
                  <Can permission="menu:create">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ operation: "addChild", menu: row.original })}
                    >
                      {t("menu.addChildMenu")}
                    </Button>
                  </Can>
                  <Can permission="menu:update">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ operation: "edit", menu: row.original })}
                    >
                      {t("common.edit")}
                    </Button>
                  </Can>
                  <Can permission="menu:delete">
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
            } satisfies DataTableColumn<MenuRow>,
          ]
        : []),
    ],
    [
      t,
      expanded,
      canCreate,
      canUpdate,
      canDelete,
      deletion.isPending,
      menus.tableData.records,
      selection,
      menus.query.isPlaceholderData,
    ],
  )
  const selected = Object.keys(selection).filter((id) => selection[id])
  const remove = async () => {
    try {
      await deletion.mutateAsync(deleteIds)
      toast.success(t("menu.deleted"))
      setSelection({})
      setDeleteIds([])
      menus.pageAfterDelete(
        Math.max(
          0,
          menus.tableData.records.length - menus.tableData.records.filter((row) => deleteIds.includes(row.id)).length,
        ),
      )
    } catch {
      /* retain selection for retry */
    }
  }
  return (
    <div className="grid gap-4">
      <PageHeader title={t("menu.title")} description={t("menu.description")} />
      <TableHeaderOperation
        leading={
          <>
            <Can permission="menu:create">
              <Button onClick={() => setEditing({ operation: "add", menu: null })}>{t("menu.addMenu")}</Button>
            </Can>
            <Can permission="menu:delete">
              <Button
                variant="destructive"
                disabled={!selected.length || deletion.isPending || menus.query.isPlaceholderData}
                onClick={() => setDeleteIds(selected)}
              >
                {t("menu.batchDelete")}
              </Button>
            </Can>
          </>
        }
        refreshing={menus.query.isFetching}
        onRefresh={() => void menus.refresh()}
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
      <DataTable<MenuRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        pagination={{ page: menus.page, pageSize: menus.pageSize, total: menus.tableData.total }}
        onPageChange={(page) => {
          setSelection({})
          menus.setPage(page)
        }}
        onPageSizeChange={(size) => {
          setSelection({})
          menus.setPageSize(size)
        }}
        loading={menus.query.isLoading || menus.query.isPlaceholderData}
        error={menus.query.isError}
        onRetry={() => void menus.refresh()}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        columnVisibility={visibility}
        columnOrder={order}
        columnPinning={isMobile ? { left: [], right: [] } : pinning}
      />
      {editing && (editing.operation === "edit" ? canUpdate : canCreate) && (
        <MenuOperateDrawer operation={editing.operation} menu={editing.menu} onClose={() => setEditing(null)} />
      )}
      <ConfirmActionDialog
        open={canDelete && deleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteIds([])
        }}
        title={t("menu.deleteTitle")}
        description={t("menu.deleteHint")}
        pending={deletion.isPending}
        onConfirm={() => void remove()}
        confirmLabel={t("common.delete")}
      />
    </div>
  )
}

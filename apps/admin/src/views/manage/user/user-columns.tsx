import type { RowSelectionState } from "@tanstack/react-table"
import type { ReactNode } from "react"
import type { TFunction } from "i18next"
import { Badge, Checkbox } from "@rapidkit/ui"
import { Avatar, AvatarFallback, AvatarImage } from "@rapidkit/ui/components/avatar"
import type { User } from "@/services/api/user"
import type { DataTableColumn } from "@/shared/data-table"
import type { DepartmentDirectory } from "./modules/department-directory"

interface Options {
  page: number
  pageSize: number
  t: TFunction
  directory: DepartmentDirectory
  actions?: (user: User) => ReactNode
}
export function createUserColumns({ page, pageSize, t, directory, actions }: Options): DataTableColumn<User>[] {
  const columns: DataTableColumn<User>[] = [
    {
      id: "select",
      size: 44,
      enableHiding: false,
      meta: { title: t("users.table.selection"), hideable: false },
      header: ({ table }) => (
        <Checkbox
          aria-label={t("users.table.selectPage")}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("users.table.select", { name: row.original.name })}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        />
      ),
    },
    {
      id: "index",
      size: 64,
      enableHiding: false,
      header: t("users.table.index"),
      meta: { title: t("users.table.index"), hideable: false },
      cell: ({ row }) => (page - 1) * pageSize + row.index + 1,
    },
    {
      id: "username",
      accessorKey: "username",
      size: 220,
      header: t("users.table.user"),
      meta: { title: t("users.table.user"), pinnable: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            {row.original.avatar && <AvatarImage src={row.original.avatar} alt="" />}
            <AvatarFallback>{(row.original.name || row.original.username).slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="break-all font-medium">{row.original.name || row.original.username}</div>
            <div className="break-all text-xs text-muted-foreground">{row.original.username}</div>
          </div>
        </div>
      ),
    },
    {
      id: "email",
      accessorKey: "email",
      size: 210,
      header: t("users.fields.email"),
      meta: { title: t("users.fields.email") },
      cell: ({ row }) => row.original.email || "—",
    },
    {
      id: "department",
      size: 220,
      header: t("users.fields.department"),
      meta: { title: t("users.fields.department") },
      cell: ({ row }) =>
        row.original.departmentId
          ? directory
              .get(row.original.departmentId)
              ?.path.map((entry) => entry.name)
              .join(" / ") || t("users.currentDepartment", { id: row.original.departmentId })
          : t("users.unassigned"),
    },
    {
      id: "roles",
      size: 170,
      header: t("users.fields.roles"),
      meta: { title: t("users.fields.roles") },
      cell: ({ row }) =>
        row.original.isAdmin ? (
          <Badge>{t("users.fields.administrator")}</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length
              ? row.original.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))
              : "—"}
          </div>
        ),
    },
    {
      id: "status",
      accessorKey: "status",
      size: 110,
      header: t("users.fields.status"),
      meta: { title: t("users.fields.status") },
      cell: ({ row }) => (
        <Badge variant={row.original.status === "1" ? "default" : "secondary"}>
          {t(`users.status.${row.original.status}`)}
        </Badge>
      ),
    },
  ]
  if (actions)
    columns.push({
      id: "actions",
      size: 150,
      enableHiding: false,
      header: t("users.table.actions"),
      meta: { title: t("users.table.actions"), hideable: false, pinnable: true },
      cell: ({ row }) => actions(row.original),
    })
  return columns
}
export function selectedIds(selection: RowSelectionState) {
  return Object.keys(selection).filter((id) => selection[id])
}

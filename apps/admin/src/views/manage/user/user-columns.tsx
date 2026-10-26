import type { RowSelectionState } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { Badge, Checkbox } from "@rapidkit/ui"
import type { RoleOption } from "@/services/api/role"
import type { User } from "@/services/api/user"
import type { DataTableColumn } from "@/shared/data-table"

const statusLabel = { "1": "正常", "2": "禁用", "3": "待激活" } as const
export function createUserColumns(
  page: number,
  pageSize: number,
  roles: readonly RoleOption[] = [],
  actions?: (user: User) => ReactNode,
): DataTableColumn<User>[] {
  const roleNames = new Map(roles.map((role) => [role.code, role.name]))
  return [
    {
      id: "select",
      size: 44,
      enableHiding: false,
      meta: { title: "选择", hideable: false },
      header: ({ table }) => (
        <Checkbox
          aria-label="选择当前页"
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`选择${row.original.name}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        />
      ),
    },
    {
      id: "index",
      size: 64,
      enableHiding: false,
      meta: { title: "序号", hideable: false },
      header: "序号",
      cell: ({ row }) => (page - 1) * pageSize + row.index + 1,
    },
    { accessorKey: "username", id: "username", header: "用户名", meta: { title: "用户名", pinnable: true } },
    { accessorKey: "name", id: "name", header: "姓名", meta: { title: "姓名", pinnable: true } },
    { accessorKey: "email", id: "email", header: "邮箱", meta: { title: "邮箱" } },
    {
      id: "roles",
      header: "角色",
      meta: { title: "角色" },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {roleNames.get(role) ?? role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "departmentId",
      id: "department",
      header: "部门",
      meta: { title: "部门" },
      cell: ({ row }) => row.original.departmentId ?? "—",
    },
    {
      accessorKey: "status",
      id: "status",
      header: "状态",
      meta: { title: "状态" },
      cell: ({ row }) => (
        <Badge variant={row.original.status === "1" ? "default" : "secondary"}>
          {statusLabel[row.original.status]}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 260,
      enableHiding: false,
      header: "操作",
      meta: { title: "操作", hideable: false, pinnable: true },
      cell: ({ row }) => actions?.(row.original),
    },
  ]
}

export function selectedIds(selection: RowSelectionState) {
  return Object.keys(selection).filter((id) => selection[id])
}

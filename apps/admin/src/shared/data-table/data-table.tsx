import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnPinningState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table"
import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"
import type { DataTableColumn, DataTablePaginationState } from "./types"
import { DataTablePagination } from "./data-table-pagination"

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  getRowId: (row: T) => string
  pagination: DataTablePaginationState
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  emptyText?: string
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void
  columnVisibility?: VisibilityState
  columnOrder?: string[]
  columnPinning?: ColumnPinningState
}

function pinnedStyle(column: {
  getIsPinned(): false | "left" | "right"
  getStart(position: "left"): number
  getAfter(position: "right"): number
  getSize(): number
}) {
  const pinned = column.getIsPinned()
  if (!pinned) return undefined
  return {
    position: "sticky" as const,
    left: pinned === "left" ? column.getStart("left") : undefined,
    right: pinned === "right" ? column.getAfter("right") : undefined,
    width: column.getSize(),
    zIndex: 1,
  }
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  pagination,
  onPageChange,
  onPageSizeChange,
  loading,
  error,
  onRetry,
  emptyText,
  rowSelection = {},
  onRowSelectionChange,
  columnVisibility = {},
  columnOrder = [],
  columnPinning = { left: [], right: [] },
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(pagination.total / pagination.pageSize),
    enableRowSelection: true,
    state: { rowSelection, columnVisibility, columnOrder, columnPinning },
    onRowSelectionChange: (updater) =>
      onRowSelectionChange?.(typeof updater === "function" ? updater(rowSelection) : updater),
  })
  const visibleColumns = table.getVisibleLeafColumns().length || 1
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table style={{ minWidth: table.getTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} style={pinnedStyle(header.column)} className="bg-muted/50">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: visibleColumns }, (_, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={visibleColumns} className="h-32 text-center">
                  <div className="grid justify-items-center gap-2">
                    <span>{t("datatable.loadFailed")}</span>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        {t("datatable.retry")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={pinnedStyle(cell.column)}
                      className={cell.column.getIsPinned() ? "bg-card" : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumns} className="h-32 text-center text-muted-foreground">
                  {emptyText ?? t("datatable.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination {...pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
    </div>
  )
}

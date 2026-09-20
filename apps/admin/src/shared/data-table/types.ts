import type {
  ColumnDef,
  ColumnOrderState,
  ColumnPinningState,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table"

export interface PaginatedResponse<T> {
  records: T[]
  page: number
  pageSize: number
  total: number
}

export interface DataTablePaginationState {
  page: number
  pageSize: number
  total: number
}

export interface DataTableColumnMeta {
  title?: string
  hideable?: boolean
  pinnable?: boolean
}

export type DataTableColumn<T> = ColumnDef<T> & { meta?: DataTableColumnMeta }

export interface DataTableViewState {
  columnVisibility: VisibilityState
  columnOrder: ColumnOrderState
  columnPinning: ColumnPinningState
  rowSelection: RowSelectionState
}

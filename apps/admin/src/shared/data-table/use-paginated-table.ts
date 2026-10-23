import { useCallback, useState } from "react"
import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query"
import type { PaginatedResponse } from "./types"
import { nextPageAfterDelete } from "./table-state"

export interface UsePaginatedTableOptions<T> {
  initialPage?: number
  initialPageSize?: number
  staleTime?: number
  queryKey: QueryKey
  queryFn: (pagination: { page: number; pageSize: number }) => Promise<PaginatedResponse<T>>
}

export function usePaginatedTable<T>({
  initialPage = 1,
  initialPageSize = 10,
  staleTime,
  queryKey,
  queryFn,
}: UsePaginatedTableOptions<T>) {
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size)
    setPage(1)
  }, [])
  const resetPage = useCallback(() => setPage(1), [])
  const pageAfterDelete = useCallback((remainingRecords: number) => {
    setPage((current) => nextPageAfterDelete({ page: current, remainingRecords }))
  }, [])
  const bind = useCallback(
    (data?: PaginatedResponse<T>) => ({
      records: data?.records ?? [],
      total: data?.total ?? 0,
      page: data?.page ?? page,
      pageSize: data?.pageSize ?? pageSize,
    }),
    [page, pageSize],
  )
  const query = useQuery({
    queryKey: [...queryKey, { page, pageSize }],
    queryFn: () => queryFn({ page, pageSize }),
    placeholderData: keepPreviousData,
    ...(staleTime === undefined ? {} : { staleTime }),
  })
  const tableData = bind(query.data)

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    pageAfterDelete,
    bind,
    query,
    tableData,
    refresh: query.refetch,
  }
}

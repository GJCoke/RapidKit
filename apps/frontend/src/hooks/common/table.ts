/* oxlint-disable @typescript-eslint/no-explicit-any */
import type { Ref, ShallowRef } from "vue"
import { computed, effectScope, onScopeDispose, reactive, shallowRef, watch } from "vue"
import type { PaginationProps } from "naive-ui"
import type { PaginationData, TableColumnCheck, UseTableOptions } from "@rapidkit/hooks"
import { useBoolean, useTable } from "@rapidkit/hooks"
import type { FlatResponseData } from "@rapidkit/axios"
import { jsonClone } from "@rapidkit/utils"
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/constants/pagination"
import { useAppStore } from "@/store/modules/app"
import { $t } from "@/locales"
import { createColumnCheckMemory, tableScrollWidth } from "./table-columns"

export type UseNaiveTableOptions<ResponseData, ApiData, Pagination extends boolean> = Omit<
  UseTableOptions<ResponseData, ApiData, NaiveUI.TableColumn<ApiData>, Pagination>,
  "pagination" | "getColumnChecks" | "getColumns"
> & {
  /**
   * get column visible
   *
   * @param column
   *
   * @default true
   *
   * @returns true if the column is visible, false otherwise
   */
  getColumnVisible?: (column: NaiveUI.TableColumn<ApiData>) => boolean
}

export interface UseTableOperateReturn<TableData> {
  drawerVisible: Ref<boolean>
  openDrawer: () => void
  closeDrawer: () => void
  operateType: ShallowRef<NaiveUI.TableOperateType>
  handleAdd: () => void
  editingData: ShallowRef<TableData | null>
  handleEdit: (id: TableData[keyof TableData]) => void
  checkedRowKeys: ShallowRef<string[]>
  onBatchDeleted: () => Promise<void>
  onDeleted: () => Promise<void>
}

const SELECTION_KEY = "__selection__"

const EXPAND_KEY = "__expand__"

export function useNaiveTable<ResponseData, ApiData>(options: UseNaiveTableOptions<ResponseData, ApiData, false>) {
  const scope = effectScope()
  const appStore = useAppStore()

  const sourceColumns = computed(options.columns)
  const memory = createColumnCheckMemory()

  const result = useTable<ResponseData, ApiData, NaiveUI.TableColumn<ApiData>, false>({
    ...options,
    columns: () => sourceColumns.value,
    getColumnChecks: (cols) => getColumnChecks(cols, options.getColumnVisible),
    getColumns: (cols, checks) => getColumns(cols, checks, appStore.isMobile),
  })

  result.reloadColumns = () => {
    result.columnChecks.value = memory.reconcile(
      result.columnChecks.value,
      getColumnChecks(sourceColumns.value, options.getColumnVisible),
    )
  }
  result.reloadColumns()
  const scrollX = computed(() => tableScrollWidth(result.columns.value))

  scope.run(() => {
    watch(sourceColumns, () => result.reloadColumns(), { flush: "sync" })
    watch(
      () => appStore.locale,
      () => {
        result.reloadColumns()
      },
    )
  })

  onScopeDispose(() => {
    scope.stop()
  })

  return {
    ...result,
    scrollX,
  }
}

type PaginationParams = Pick<PaginationProps, "page" | "pageSize">

type UseNaivePaginatedTableOptions<ResponseData, ApiData> = UseNaiveTableOptions<ResponseData, ApiData, true> & {
  paginationProps?: Omit<PaginationProps, "page" | "pageSize" | "itemCount">
  /**
   * whether to show the total count of the table
   *
   * @default true
   */
  showTotal?: boolean
  onPaginationParamsChange?: (params: PaginationParams) => void | Promise<void>
}

export function useNaivePaginatedTable<ResponseData, ApiData>(
  options: UseNaivePaginatedTableOptions<ResponseData, ApiData>,
) {
  const scope = effectScope()
  const appStore = useAppStore()

  const isMobile = computed(() => appStore.isMobile)

  const showTotal = computed(() => options.showTotal ?? true)

  const pagination = reactive({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    itemCount: 0,
    showSizePicker: true,
    pageSizes: [...PAGE_SIZE_OPTIONS],
    prefix: showTotal.value ? (page) => $t("datatable.itemCount", { total: page.itemCount }) : undefined,
    onUpdatePage(page) {
      pagination.page = page
    },
    onUpdatePageSize(pageSize) {
      pagination.pageSize = pageSize
      pagination.page = 1
    },
    ...options.paginationProps,
  }) as PaginationProps

  // this is for mobile, if the system does not support mobile, you can use `pagination` directly
  const mobilePagination = computed(() => {
    const p: PaginationProps = {
      ...pagination,
      pageSlot: isMobile.value ? 3 : 9,
      prefix: !isMobile.value && showTotal.value ? pagination.prefix : undefined,
    }

    return p
  })

  const paginationParams = computed(() => {
    const { page, pageSize } = pagination

    return {
      page,
      pageSize,
    }
  })

  const sourceColumns = computed(options.columns)
  const memory = createColumnCheckMemory()

  const result = useTable<ResponseData, ApiData, NaiveUI.TableColumn<ApiData>, true>({
    ...options,
    columns: () => sourceColumns.value,
    pagination: true,
    getColumnChecks: (cols) => getColumnChecks(cols, options.getColumnVisible),
    getColumns: (cols, checks) => getColumns(cols, checks, appStore.isMobile),
    onFetched: (data) => {
      pagination.itemCount = data.total
      pagination.pageSize = data.pageSize
    },
  })

  async function getDataByPage(page: number = 1) {
    if (page !== pagination.page) {
      pagination.page = page

      return
    }

    await result.getData()
  }

  result.reloadColumns = () => {
    result.columnChecks.value = memory.reconcile(
      result.columnChecks.value,
      getColumnChecks(sourceColumns.value, options.getColumnVisible),
    )
  }
  result.reloadColumns()
  const scrollX = computed(() => tableScrollWidth(result.columns.value))

  scope.run(() => {
    watch(sourceColumns, () => result.reloadColumns(), { flush: "sync" })
    watch(
      () => appStore.locale,
      () => {
        result.reloadColumns()
      },
    )

    watch(paginationParams, async (newVal) => {
      await options.onPaginationParamsChange?.(newVal)

      await result.getData()
    })
  })

  onScopeDispose(() => {
    scope.stop()
  })

  return {
    ...result,
    scrollX,
    getDataByPage,
    pagination,
    mobilePagination,
  }
}

export function useTableOperate<TableData>(
  data: Ref<TableData[]>,
  idKey: keyof TableData,
  getData: () => Promise<void>,
): UseTableOperateReturn<TableData> {
  const { bool: drawerVisible, setTrue: openDrawer, setFalse: closeDrawer } = useBoolean()

  const operateType = shallowRef<NaiveUI.TableOperateType>("add")

  function handleAdd() {
    operateType.value = "add"
    openDrawer()
  }

  /** the editing row data */
  const editingData = shallowRef<TableData | null>(null)

  function handleEdit(id: TableData[keyof TableData]) {
    operateType.value = "edit"
    const findItem = data.value.find((item) => item[idKey] === id) || null
    editingData.value = jsonClone(findItem)

    openDrawer()
  }

  /** the checked row keys of table */
  const checkedRowKeys = shallowRef<string[]>([])

  /** the hook after the batch delete operation is completed */
  async function onBatchDeleted() {
    window.$message?.success($t("common.deleteSuccess"))

    checkedRowKeys.value = []

    await getData()
  }

  /** the hook after the delete operation is completed */
  async function onDeleted() {
    window.$message?.success($t("common.deleteSuccess"))

    await getData()
  }

  return {
    drawerVisible,
    openDrawer,
    closeDrawer,
    operateType,
    handleAdd,
    editingData,
    handleEdit,
    checkedRowKeys,
    onBatchDeleted,
    onDeleted,
  }
}

export function defaultTransform<ApiData>(
  response: FlatResponseData<any, Api.Common.PaginatingQueryRecord<ApiData>>,
): PaginationData<ApiData> {
  const { data, error } = response

  if (!error) {
    const { records, page, pageSize, total } = data

    return {
      data: records,
      pageNum: page,
      pageSize,
      total,
    }
  }

  return {
    data: [],
    pageNum: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  }
}

function getColumnChecks<Column extends NaiveUI.TableColumn<any>>(
  cols: Column[],
  getColumnVisible?: (column: Column) => boolean,
) {
  const checks: TableColumnCheck[] = []

  cols.forEach((column) => {
    if (isTableColumnHasKey(column)) {
      checks.push({
        key: column.key as string,
        title: column.title!,
        checked: true,
        fixed: column.fixed ?? "unFixed",
        visible: getColumnVisible?.(column) ?? true,
      })
    } else if (column.type === "selection") {
      checks.push({
        key: SELECTION_KEY,
        title: $t("common.check"),
        checked: true,
        fixed: column.fixed ?? "unFixed",
        visible: getColumnVisible?.(column) ?? false,
      })
    } else if (column.type === "expand") {
      checks.push({
        key: EXPAND_KEY,
        title: $t("common.expandColumn"),
        checked: true,
        fixed: column.fixed ?? "unFixed",
        visible: getColumnVisible?.(column) ?? false,
      })
    }
  })

  return checks
}

function getColumns<Column extends NaiveUI.TableColumn<any>>(
  cols: Column[],
  checks: TableColumnCheck[],
  mobile = false,
) {
  const columnMap = new Map<string, Column>()

  cols.forEach((column) => {
    if (isTableColumnHasKey(column)) {
      columnMap.set(column.key as string, column)
    } else if (column.type === "selection") {
      columnMap.set(SELECTION_KEY, column)
    } else if (column.type === "expand") {
      columnMap.set(EXPAND_KEY, column)
    }
  })

  return checks.flatMap((check) => {
    const column = columnMap.get(check.key)
    if (!check.checked || !column) return []
    return [{ ...column, fixed: mobile ? undefined : check.fixed } as Column]
  })
}

export function isTableColumnHasKey<T>(column: NaiveUI.TableColumn<T>): column is NaiveUI.TableColumnWithKey<T> {
  return Boolean((column as NaiveUI.TableColumnWithKey<T>).key)
}

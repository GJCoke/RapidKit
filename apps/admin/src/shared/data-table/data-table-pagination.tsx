import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rapidkit/ui"
import { useTranslation } from "react-i18next"

interface DataTablePaginationProps {
  page: number
  pageSize: number
  total: number
  pageSizes?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  pageSizes = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pageSizeItems = pageSizes.map((size) => ({ value: String(size), label: t("datatable.pageSize", { size }) }))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm">
      <span className="text-muted-foreground">{t("datatable.total", { total })}</span>
      <div className="flex items-center gap-2">
        <Select
          items={pageSizeItems}
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger aria-label={t("datatable.pageSizeLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {t("datatable.previousPage")}
        </Button>
        <span>
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          {t("datatable.nextPage")}
        </Button>
      </div>
    </div>
  )
}

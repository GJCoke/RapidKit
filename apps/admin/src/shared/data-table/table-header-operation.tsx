import type { ReactNode } from "react"
import { Button } from "@rapidkit/ui"
import { RefreshCwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

export function TableHeaderOperation({
  leading,
  children,
  trailing,
  refreshing,
  onRefresh,
}: {
  leading?: ReactNode
  children?: ReactNode
  trailing?: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        {children}
      </div>
      <div className="flex items-center gap-2">
        {trailing}
        {onRefresh && (
          <Button
            aria-label={t("datatable.refresh")}
            variant="outline"
            size="icon-sm"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
          </Button>
        )}
      </div>
    </div>
  )
}

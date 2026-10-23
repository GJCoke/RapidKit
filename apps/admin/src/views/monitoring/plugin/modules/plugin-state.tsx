import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, Skeleton } from "@rapidkit/ui"
export function PluginState({
  resource,
  empty = false,
  emptyText,
  children,
}: {
  resource: { isFetching: boolean; isError: boolean; data?: unknown; refetch: () => Promise<unknown> }
  empty?: boolean
  emptyText?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (resource.isError)
    return (
      <div role="alert" className="grid justify-items-center gap-3 py-8">
        <p>{t("state.error")}</p>
        <Button variant="outline" onClick={() => void resource.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    )
  if (resource.data === undefined && resource.isFetching)
    return (
      <div role="status" className="grid gap-3 py-6">
        <span>{t("common.loading")}</span>
        <Skeleton className="h-36 w-full" />
      </div>
    )
  if (empty)
    return (
      <p className="grid min-h-36 place-content-center text-sm text-muted-foreground">
        {emptyText ?? t("datatable.empty")}
      </p>
    )
  return children
}
export const pluginStatusClass = (status: string) =>
  ({
    loaded: "text-emerald-600 dark:text-emerald-400",
    disabled: "text-amber-600 dark:text-amber-400",
    failed: "text-destructive",
    degraded: "text-amber-600 dark:text-amber-400",
  })[status] ?? "text-muted-foreground"

import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, Skeleton } from "@rapidkit/ui"
export function HomeCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  )
}
export interface HomeQueryState {
  data?: unknown
  isFetching: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}
export function HomeState({
  query,
  empty = false,
  emptyLabel,
  children,
}: {
  query: HomeQueryState
  empty?: boolean
  emptyLabel?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (!query.isError && query.data === undefined)
    return (
      <div role="status" className="space-y-3">
        <p>{t("state.loading")}</p>
        <Skeleton className="h-36 w-full" />
      </div>
    )
  return (
    <>
      {query.isError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{t("state.error")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {query.data !== undefined &&
        (empty ? (
          <p className="grid min-h-32 place-content-center text-sm text-muted-foreground">
            {emptyLabel ?? t("homeDashboard.noData")}
          </p>
        ) : (
          children
        ))}
    </>
  )
}

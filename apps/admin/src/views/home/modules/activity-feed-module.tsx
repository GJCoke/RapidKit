import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@rapidkit/ui"
import { useHomeActivities } from "@/services/hooks/use-home-dashboard"
import type { ActivityItem } from "@/services/api/dashboard"
import { activityText, type ActivityFilter } from "./home-model"
import { HomeCard, HomeState } from "./home-card"
function ActivityDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} className="w-[calc(100vw-24px)] max-w-2xl sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>{title}</SheetTitle>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          </div>
          <SheetDescription>{t("homeDashboard.activityFeed")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
export function ActivityFeedModule() {
  const { t, i18n } = useTranslation(),
    [category, setCategory] = useState<ActivityFilter>("all"),
    [all, setAll] = useState(false),
    [selected, setSelected] = useState<ActivityItem | null>(null)
  const query = useHomeActivities(category),
    items = query.data?.items ?? []
  const label = (key: string) => t(`homeDashboard.${key}`)
  const title = (item: ActivityItem) =>
    activityText(
      item.titleKey,
      item.titleParams,
      (key, params) => t(key, params),
      (key) => i18n.exists(key),
    )
  const description = (item: ActivityItem) =>
    item.descriptionKey
      ? activityText(
          item.descriptionKey,
          item.descriptionParams,
          (key, params) => t(key, params),
          (key) => i18n.exists(key),
        )
      : ""
  const time = (value: string, full = false) => {
    const date = new Date(value)
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(
          i18n.language,
          full
            ? { dateStyle: "medium", timeStyle: "medium" }
            : { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
        ).format(date)
      : value
  }
  const result = (item: ActivityItem) => label(`activityResult.${item.level}`)
  const tone = (item: ActivityItem) =>
    item.level === "error" ? "text-destructive" : item.level === "warning" ? "text-warning" : "text-success"
  const categoryLabel = (item: ActivityItem) => label(`activityCategory.${item.category}`)
  const row = (item: ActivityItem, compact = false) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSelected(item)}
      className="grid w-full grid-cols-[74px_52px_minmax(0,1fr)] items-start gap-2 border-b py-3 text-left text-xs last:border-0 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[74px_64px_minmax(0,1fr)_80px_60px]"
    >
      <time className="tabular-nums" dateTime={item.occurredAt}>
        {time(item.occurredAt)}
      </time>
      <span>{categoryLabel(item)}</span>
      <span className="min-w-0">
        <span className="block break-words font-medium">{title(item)}</span>
        {!compact && description(item) && (
          <span className="mt-1 block break-words text-muted-foreground">{description(item)}</span>
        )}
      </span>
      <span className="hidden truncate sm:block">{item.actorName || label("activityCategory.system")}</span>
      <span className={`col-start-3 row-start-2 sm:col-auto sm:row-auto ${tone(item)}`}>{result(item)}</span>
    </button>
  )
  return (
    <>
      <HomeCard
        title={label("recentActivity")}
        actions={
          <Button variant="link" onClick={() => setAll(true)}>
            {label("viewAllActivities")}
          </Button>
        }
      >
        <div role="group" aria-label={label("activityFeed")} className="mb-4 flex flex-wrap gap-2">
          {(["all", "task", "user", "system", "alert"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={category === value ? "secondary" : "ghost"}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {label(`activityCategory.${value}`)}
            </Button>
          ))}
        </div>
        <HomeState query={query} empty={items.length === 0}>
          <div className="grid grid-cols-[74px_52px_minmax(0,1fr)] gap-2 border-b pb-2 text-xs text-muted-foreground sm:grid-cols-[74px_64px_minmax(0,1fr)_80px_60px]">
            <span>{label("activityTable.time")}</span>
            <span>{label("activityTable.type")}</span>
            <span>{label("activityTable.content")}</span>
            <span className="hidden sm:block">{label("activityTable.user")}</span>
            <span className="hidden sm:block">{label("activityTable.result")}</span>
          </div>
          {items.slice(0, 5).map((item) => row(item))}
        </HomeState>
      </HomeCard>
      <ActivityDrawer open={all} onOpenChange={setAll} title={label("allActivities")}>
        <HomeState query={query} empty={items.length === 0}>
          {items.map((item) => row(item, true))}
        </HomeState>
      </ActivityDrawer>
      <ActivityDrawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title={label("activityDetails")}
      >
        {selected && (
          <dl className="divide-y text-sm">
            {[
              { key: "time", value: time(selected.occurredAt, true) },
              { key: "type", value: categoryLabel(selected) },
              {
                key: "content",
                value: (
                  <>
                    {title(selected)}
                    {description(selected) && <p className="mt-2 text-muted-foreground">{description(selected)}</p>}
                  </>
                ),
              },
              { key: "user", value: selected.actorName || label("activityCategory.system") },
              { key: "result", value: <span className={tone(selected)}>{result(selected)}</span> },
              { key: "eventCode", value: <code>{selected.eventCode}</code> },
            ].map(({ key, value }) => (
              <div key={key} className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-muted-foreground">{label(`activityTable.${key}`)}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </ActivityDrawer>
    </>
  )
}

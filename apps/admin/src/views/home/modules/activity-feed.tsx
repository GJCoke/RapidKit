import { useTranslation } from "react-i18next"
import { Card, CardContent, CardHeader, CardTitle } from "@rapidkit/ui/components/card"
import { EmptyState } from "@/features/layout/components/states/empty-state"

interface ActivityItem {
  id: string
  title: string
  time: string
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home.activityFeed")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState message={t("state.empty")} />
        ) : (
          <ol className="relative ml-2 border-l border-border">
            {items.map((item) => (
              <li key={item.id} className="relative ml-5 pb-5 last:pb-0">
                <span className="absolute -left-6 top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card" />
                <p className="text-sm">{item.title}</p>
                <time className="text-xs text-muted-foreground">{item.time}</time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

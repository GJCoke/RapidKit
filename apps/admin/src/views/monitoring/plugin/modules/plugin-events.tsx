import { useTranslation } from "react-i18next"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@rapidkit/ui"
import type { PluginEvents } from "@/services/api/plugin-monitoring"
import { parseApiDate } from "@/shared/date-time"
export function PluginEventTables({ events }: { events: PluginEvents }) {
  const { t, i18n } = useTranslation()
  const errors = Object.entries(events.handlerErrors).sort((a, b) => b[1] - a[1])
  const date = (value: string) => {
    const parsed = parseApiDate(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language)
  }
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <section className="min-w-0">
        <h3 className="mb-3 text-sm font-medium">{t("pluginMonitoring.handlerErrors")}</h3>
        {errors.length ? (
          <div className="overflow-x-auto">
            <Table aria-label={t("pluginMonitoring.handlerErrors")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pluginMonitoring.event")}</TableHead>
                  <TableHead className="text-right">{t("pluginMonitoring.count")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map(([name, count]) => (
                  <TableRow key={name}>
                    <TableCell className="whitespace-normal wrap-anywhere">{name}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("pluginMonitoring.noErrors")}</p>
        )}
      </section>
      <section className="min-w-0">
        <h3 className="mb-3 text-sm font-medium">
          {t("pluginMonitoring.deadLetters")}
          {events.deadLetterCount > 0 && <span className="ml-2 text-muted-foreground">{events.deadLetterCount}</span>}
        </h3>
        {events.deadLetters.length ? (
          <div className="max-h-60 overflow-auto">
            <Table aria-label={t("pluginMonitoring.deadLetters")}>
              <TableHeader>
                <TableRow>
                  {["event", "time", "source"].map((key) => (
                    <TableHead key={key}>{t(`pluginMonitoring.${key}`)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.deadLetters.map((row, index) => (
                  <TableRow key={`${row.eventName}-${row.timestamp}-${index}`}>
                    <TableCell className="whitespace-normal wrap-anywhere">{row.eventName}</TableCell>
                    <TableCell className="whitespace-normal">
                      <time dateTime={row.timestamp}>{date(row.timestamp)}</time>
                    </TableCell>
                    <TableCell className="whitespace-normal wrap-anywhere">{row.source ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("pluginMonitoring.noDeadLetters")}</p>
        )}
      </section>
    </div>
  )
}

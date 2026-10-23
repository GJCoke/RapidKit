import { Fragment, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@rapidkit/ui"
import type { PluginList } from "@/services/api/plugin-monitoring"
import { pluginStatusClass } from "./plugin-state"
export function PluginTable({ plugins }: { plugins: PluginList }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const timing = (value?: number | null) => (value === null || value === undefined ? "-" : `${value.toFixed(1)} ms`)
  return (
    <div className="overflow-x-auto">
      <Table aria-label={t("pluginMonitoring.pluginList")} className="min-w-150">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">{t("pluginMonitoring.details")}</span>
            </TableHead>
            {["name", "version", "status", "registerTime", "startupTime"].map((key) => (
              <TableHead key={key}>{t(`pluginMonitoring.${key}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {plugins.map((plugin) => (
            <Fragment key={plugin.name}>
              <TableRow className={plugin.status === "disabled" ? "opacity-60" : undefined}>
                <TableCell>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-expanded={expanded.has(plugin.name)}
                    aria-label={t(expanded.has(plugin.name) ? "pluginMonitoring.collapse" : "pluginMonitoring.expand", {
                      name: plugin.name,
                    })}
                    onClick={() =>
                      setExpanded((previous) => {
                        const next = new Set(previous)
                        if (next.has(plugin.name)) next.delete(plugin.name)
                        else next.add(plugin.name)
                        return next
                      })
                    }
                  >
                    {expanded.has(plugin.name) ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                </TableCell>
                <TableCell className={`font-medium ${plugin.status === "failed" ? "text-destructive" : ""}`}>
                  {plugin.name}
                </TableCell>
                <TableCell>{plugin.version ?? "-"}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${pluginStatusClass(plugin.status)}`}
                  >
                    {t(`pluginMonitoring.status_${plugin.status}`, { defaultValue: plugin.status })}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">{timing(plugin.loadTimeMs)}</TableCell>
                <TableCell className="font-mono text-xs">{timing(plugin.startupTimeMs)}</TableCell>
              </TableRow>
              {expanded.has(plugin.name) && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/30 whitespace-normal wrap-anywhere">
                    {plugin.status === "loaded" ? (
                      <dl className="grid gap-2 p-2 text-sm">
                        <div>
                          <dt className="inline text-muted-foreground">{t("pluginMonitoring.dependencies")}: </dt>
                          <dd className="inline">
                            {plugin.dependencies?.length
                              ? plugin.dependencies.map((dep) => (
                                  <span key={dep} className="mr-2 inline-block rounded border px-2 py-0.5 text-xs">
                                    {dep}
                                  </span>
                                ))
                              : "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground">{t("pluginMonitoring.required")}: </dt>
                          <dd className="inline">
                            {t(plugin.required ? "pluginMonitoring.yes" : "pluginMonitoring.no")}
                          </dd>
                        </div>
                      </dl>
                    ) : plugin.status === "disabled" ? (
                      <p className="p-2 text-muted-foreground">{t("pluginMonitoring.disabledHint")}</p>
                    ) : plugin.status === "failed" && plugin.error ? (
                      <dl className="grid gap-2 p-2 text-destructive">
                        {[
                          { key: "errorPhase", value: plugin.error.phase },
                          { key: "errorMessage", value: plugin.error.message },
                          ...(plugin.error.causedBy ? [{ key: "causedBy", value: plugin.error.causedBy }] : []),
                        ].map((item) => (
                          <div key={item.key}>
                            <dt className="inline">{t(`pluginMonitoring.${item.key}`)}: </dt>
                            <dd className="inline font-mono text-xs">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

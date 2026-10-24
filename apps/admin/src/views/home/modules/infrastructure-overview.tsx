import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useHomeInfrastructure, useHomeResources } from "@/services/hooks/use-home-dashboard"
import { FormSelect } from "@/shared/crud/form-select"
import { HomeCard, HomeState } from "./home-card"
import { selectedResource, formatTraffic } from "./home-model"
export function InfrastructureModule() {
  const { t } = useTranslation(),
    infrastructure = useHomeInfrastructure(),
    query = useHomeResources()
  const [selected, setSelected] = useState("summary"),
    instances = query.data?.instances ?? []
  const resources = selectedResource(instances, selected)
  useEffect(() => {
    if (query.data && selected !== "summary" && !query.data.instances.some((item) => item.hostname === selected))
      setSelected("summary")
  }, [query.data, selected])
  const label = (key: string) => t(`homeDashboard.${key}`)
  return (
    <HomeCard
      title={label("infrastructure")}
      actions={
        instances.length > 1 && (
          <div className="w-44">
            <FormSelect
              label={label("instance")}
              value={resources.selected}
              onChange={setSelected}
              options={[
                { value: "summary", label: t("homeDashboard.allInstances", { n: instances.length }) },
                ...instances.map((item) => ({ value: item.hostname, label: item.hostname })),
              ]}
            />
          </div>
        )
      }
    >
      <HomeState query={infrastructure}>
        {infrastructure.data && (
          <dl className="divide-y text-sm">
            {[
              { name: "PostgreSQL", data: infrastructure.data.pg },
              { name: "Redis", data: infrastructure.data.redis },
              { name: "MinIO", data: infrastructure.data.minio },
            ].map(({ name, data }) => (
              <div key={name} className="flex flex-wrap items-center gap-3 py-3">
                <dt className="flex-1 font-medium">{name}</dt>
                <dd className="text-xs tabular-nums">{data.latencyMs}ms</dd>
                <dd
                  className={
                    data.status === "healthy"
                      ? "text-success"
                      : data.status === "degraded"
                        ? "text-warning"
                        : "text-destructive"
                  }
                >
                  {label(data.status)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </HomeState>
      <div className="mt-3 border-t pt-4">
        <HomeState query={query} empty={instances.length === 0}>
          <dl className="space-y-4">
            {[
              { label: "CPU", value: resources.data.cpuPercent },
              { label: label("memory"), value: resources.data.memoryPercent },
              { label: label("disk"), value: resources.data.diskPercent },
            ].map((metric) => (
              <div key={metric.label} className="grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-2 text-sm">
                <dt>{metric.label}</dt>
                <dd>
                  <progress
                    aria-label={metric.label}
                    max={100}
                    value={Math.min(100, Math.max(0, metric.value))}
                    className={`h-2 w-full ${metric.value >= 80 ? "accent-destructive" : metric.value >= 60 ? "accent-warning" : "accent-success"}`}
                  />
                </dd>
                <dd className="text-right tabular-nums">{metric.value}%</dd>
              </div>
            ))}
          </dl>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{label("netSent")}</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatTraffic(resources.data.netSent)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{label("netRecv")}</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatTraffic(resources.data.netRecv)}</dd>
            </div>
          </dl>
        </HomeState>
      </div>
    </HomeCard>
  )
}

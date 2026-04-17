<script setup lang="tsx">
  import { computed } from "vue"
  import { NTag } from "naive-ui"
  import type { DataTableColumns } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "PluginTable" })

  const props = defineProps<{
    plugins: Api.Plugin.StatusItem[]
    loading: boolean
  }>()

  const statusTagType: Record<string, "success" | "warning" | "error" | "info"> = {
    loaded: "success",
    disabled: "warning",
    failed: "error",
    degraded: "warning",
  }

  const healthColor: Record<string, string> = {
    healthy: "var(--success-color)",
    degraded: "var(--warning-color)",
    unhealthy: "var(--error-color)",
  }

  function renderExpand(row: Api.Plugin.StatusItem) {
    if (row.status === "loaded") {
      const deps = row.dependencies ?? []
      return (
        <div class="flex-col gap-6px text-13px px-8px py-4px">
          <div>
            <span class="text-[var(--text-color-3)]">{$t("page.monitoring.plugin.dependencies")}:</span>
            <span class="ml-6px">
              {deps.length > 0
                ? deps.map((dep) => (
                    <NTag key={dep} size="tiny" class="mr-4px">
                      {dep}
                    </NTag>
                  ))
                : <span class="text-[var(--text-color-4)]">-</span>}
            </span>
          </div>
          <div>
            <span class="text-[var(--text-color-3)]">{$t("page.monitoring.plugin.required")}:</span>
            <span class="ml-6px">{row.required ? "Yes" : "No"}</span>
          </div>
        </div>
      )
    }

    if (row.status === "failed" && row.error) {
      return (
        <div class="flex-col gap-6px text-13px px-8px py-4px">
          <div>
            <span class="text-error">{$t("page.monitoring.plugin.errorPhase")}:</span>
            <span class="ml-6px text-error">{row.error.phase}</span>
          </div>
          <div>
            <span class="text-error">{$t("page.monitoring.plugin.errorMessage")}:</span>
            <span class="ml-6px text-error font-mono text-12px">{row.error.message}</span>
          </div>
          {row.error.causedBy && (
            <div>
              <span class="text-error">{$t("page.monitoring.plugin.causedBy")}:</span>
              <span class="ml-6px text-error font-mono text-12px">{row.error.causedBy}</span>
            </div>
          )}
        </div>
      )
    }

    if (row.status === "disabled") {
      return (
        <div class="text-13px px-8px py-4px text-[var(--text-color-4)]">
          {$t("page.monitoring.plugin.disabledHint")}
        </div>
      )
    }

    return null
  }

  const columns = computed<DataTableColumns<Api.Plugin.StatusItem>>(() => [
    {
      type: "expand",
      renderExpand: (rowData) => renderExpand(rowData),
    },
    {
      title: $t("page.monitoring.plugin.name"),
      key: "name",
      render: (row) => (
        <span class={row.status === "failed" ? "text-error font-600" : "font-600"}>
          {row.name}
        </span>
      ),
    },
    {
      title: $t("page.monitoring.plugin.version"),
      key: "version",
      width: 80,
      render: (row) => <span class="text-[var(--text-color-3)]">{row.version ?? "-"}</span>,
    },
    {
      title: $t("page.monitoring.plugin.status"),
      key: "status",
      width: 100,
      render: (row) => (
        <NTag size="small" type={statusTagType[row.status] ?? "default"} round>
          {$t(`page.monitoring.plugin.status_${row.status}`)}
        </NTag>
      ),
    },
    {
      title: $t("page.monitoring.plugin.health"),
      key: "health",
      width: 90,
      render: (row) => {
        if (!row.health) return <span class="text-[var(--text-color-4)]">-</span>
        return <span style={{ color: healthColor[row.health] }}>{row.health}</span>
      },
    },
    {
      title: $t("page.monitoring.plugin.registerTime"),
      key: "loadTimeMs",
      width: 100,
      render: (row) =>
        row.loadTimeMs ? (
          <span class="font-mono text-[var(--text-color-3)]">{row.loadTimeMs.toFixed(1)}ms</span>
        ) : (
          <span class="text-[var(--text-color-4)]">-</span>
        ),
    },
    {
      title: $t("page.monitoring.plugin.startupTime"),
      key: "startupTimeMs",
      width: 100,
      render: (row) =>
        row.startupTimeMs ? (
          <span class="font-mono text-[var(--text-color-3)]">{row.startupTimeMs.toFixed(1)}ms</span>
        ) : (
          <span class="text-[var(--text-color-4)]">-</span>
        ),
    },
  ])

  const rowClassName = (row: Api.Plugin.StatusItem) => {
    return row.status === "disabled" ? "opacity-60" : ""
  }
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-full">
    <div class="flex items-center gap-8px text-15px font-600 mb-12px">
      <SvgIcon icon="carbon:list" class="text-16px text-[var(--primary-color)]" />
      {{ $t("page.monitoring.plugin.pluginList") }}
    </div>
    <NDataTable
      :columns="columns"
      :data="plugins"
      :loading="loading"
      :row-class-name="rowClassName"
      :row-key="(row) => row.name"
      size="small"
      :bordered="false"
    />
  </NCard>
</template>

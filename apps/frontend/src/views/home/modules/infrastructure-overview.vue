<script setup lang="ts">
  import { computed } from "vue"
  import type { ProgressStatus, SelectOption } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "InfrastructureOverview" })

  const props = defineProps<{
    infrastructure: Api.Dashboard.InfrastructureHealth
    resources: Api.Dashboard.ResourceStats
    instanceResources: Map<string, Api.Dashboard.InstanceResourceStats>
    selectedInstance: string
  }>()

  const emit = defineEmits<{
    "update:selectedInstance": [value: string]
  }>()

  const services = computed(() => [
    { name: "PostgreSQL", icon: "carbon:data-base", data: props.infrastructure.pg },
    { name: "Redis", icon: "carbon:datastore", data: props.infrastructure.redis },
    { name: "MinIO", icon: "carbon:storage-pool", data: props.infrastructure.minio },
  ])

  const resourceMetrics = computed(() => [
    { label: "CPU", icon: "carbon:chip", value: props.resources.cpuPercent },
    {
      label: $t("page.home.dashboard.memory"),
      icon: "carbon:container-software",
      value: props.resources.memoryPercent,
    },
    { label: $t("page.home.dashboard.disk"), icon: "carbon:save", value: props.resources.diskPercent },
  ])

  const instanceOptions = computed<SelectOption[]>(() => {
    const n = props.instanceResources.size
    if (n <= 1) return []
    return [
      { label: $t("page.home.dashboard.allInstances", { n }), value: "summary" },
      ...Array.from(props.instanceResources.keys(), (hostname) => ({ label: hostname, value: hostname })),
    ]
  })

  const netInfo = computed(() => {
    const format = (bytes: number) => {
      if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB/s`
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`
      return `${(bytes / 1024).toFixed(1)} KB/s`
    }
    return { sent: format(props.resources.netSent), recv: format(props.resources.netRecv) }
  })

  function statusLabel(status: string) {
    if (status === "healthy") return $t("page.home.dashboard.healthy")
    if (status === "degraded") return $t("page.home.dashboard.degraded")
    return $t("page.home.dashboard.down")
  }

  function statusType(status: string): "success" | "warning" | "error" {
    if (status === "healthy") return "success"
    if (status === "degraded") return "warning"
    return "error"
  }

  function progressStatus(percent: number): ProgressStatus {
    if (percent >= 80) return "error"
    if (percent >= 60) return "warning"
    return "success"
  }
</script>

<template>
  <NCard bordered class="infrastructure-card h-full" content-style="padding: 0; height: 100%; display: flex; flex-direction: column">
    <header class="flex items-center justify-between gap-12px px-18px pb-10px pt-15px">
      <div class="flex items-center gap-8px">
        <SvgIcon icon="carbon:cloud-monitoring" class="text-17px text-primary" />
        <h2 class="m-0 text-16px font-700 text-base-text-1">{{ $t("page.home.dashboard.infrastructure") }}</h2>
      </div>
      <NSelect
        v-if="instanceOptions.length"
        :value="selectedInstance"
        :options="instanceOptions"
        size="tiny"
        class="max-w-145px"
        :consistent-menu-width="false"
        @update:value="emit('update:selectedInstance', $event)"
      />
    </header>

    <section class="border-t border-theme-naive px-18px pb-6px pt-4px">
      <div class="divide-y">
        <div
          v-for="service in services"
          :key="service.name"
          class="service-row flex min-h-39px items-center gap-9px transition-colors hover:bg-theme-modal"
        >
          <SvgIcon :icon="service.icon" class="flex-shrink-0 text-15px text-base-text-3" />
          <span class="min-w-0 flex-1 truncate text-13px font-500 text-base-text-1">{{ service.name }}</span>
          <span class="text-11px tabular-nums text-base-text-3">{{ service.data.latencyMs }}ms</span>
          <NTag :type="statusType(service.data.status)" size="small" round :bordered="false">
            {{ statusLabel(service.data.status) }}
          </NTag>
        </div>
      </div>
    </section>

    <section class="flex flex-1 items-center border-t border-theme-naive px-18px py-9px">
      <div class="w-full flex flex-col gap-7px">
        <div v-for="metric in resourceMetrics" :key="metric.label" class="grid grid-cols-[62px_minmax(0,1fr)_42px] items-center gap-8px">
          <span class="flex items-center gap-6px text-12px text-base-text-2">
            <SvgIcon :icon="metric.icon" class="text-14px text-base-text-3" />
            {{ metric.label }}
          </span>
          <NProgress
            type="line"
            :percentage="metric.value"
            :status="progressStatus(metric.value)"
            :show-indicator="false"
            :height="7"
            :border-radius="4"
          />
          <span class="text-right text-12px font-600 tabular-nums text-base-text-2">{{ metric.value }}%</span>
        </div>
      </div>
    </section>

    <footer class="grid grid-cols-2 border-t border-theme-naive px-18px py-10px">
      <div class="flex items-center gap-7px border-r border-theme-naive pr-10px">
        <SvgIcon icon="carbon:arrow-up" class="text-15px text-success" />
        <div class="min-w-0">
          <div class="truncate text-10px text-base-text-3">{{ $t("page.home.dashboard.netSent") }}</div>
          <div class="text-12px font-600 tabular-nums text-base-text-1">{{ netInfo.sent }}</div>
        </div>
      </div>
      <div class="flex items-center gap-7px pl-10px">
        <SvgIcon icon="carbon:arrow-down" class="text-15px text-primary" />
        <div class="min-w-0">
          <div class="truncate text-10px text-base-text-3">{{ $t("page.home.dashboard.netRecv") }}</div>
          <div class="text-12px font-600 tabular-nums text-base-text-1">{{ netInfo.recv }}</div>
        </div>
      </div>
    </footer>
  </NCard>
</template>

<style scoped>
  .infrastructure-card {
    border-color: var(--n-border-color);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgb(15 23 42 / 4%);
  }

  .service-row {
    margin-inline: -4px;
    padding-inline: 4px;
  }

  .service-row + .service-row {
    border-color: var(--n-border-color);
  }
</style>

<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardAppStatus" })

  const props = defineProps<{
    healthStats: Api.Dashboard.HealthStats
  }>()

  const fmt = (v: number, suffix = "") => (v ? `${v}${suffix}` : "—")

  const metrics = computed(() => [
    {
      value: fmt(props.healthStats.qps),
      label: "QPS",
      icon: "carbon:meter-alt",
      tone: "text-success",
      tip: $t("page.home.dashboard.qpsTip"),
    },
    {
      value: fmt(props.healthStats.p50Ms, "ms"),
      label: "P50",
      icon: "carbon:timer",
      tone: "text-info",
      tip: $t("page.home.dashboard.p50Tip"),
    },
    {
      value: fmt(props.healthStats.p95Ms, "ms"),
      label: "P95",
      icon: "carbon:time",
      tone: "text-primary",
      tip: $t("page.home.dashboard.p95Tip"),
    },
    {
      value: fmt(props.healthStats.http5Xx1H),
      label: $t("page.home.dashboard.http5xx"),
      icon: "carbon:close-outline",
      tone: "text-error",
      tip: $t("page.home.dashboard.http5xxTip"),
    },
    {
      value: fmt(props.healthStats.bizErrors1H),
      label: $t("page.home.dashboard.bizErrors"),
      icon: "carbon:warning",
      tone: "text-warning",
      tip: $t("page.home.dashboard.bizErrorsTip"),
    },
    {
      value: fmt(props.healthStats.wsConnections),
      label: $t("page.home.dashboard.wsConnections"),
      icon: "carbon:connect",
      tone: "text-info",
      tip: $t("page.home.dashboard.wsConnectionsTip"),
    },
  ])
</script>

<template>
  <NCard :bordered="false" class="card-wrapper h-400px">
    <div class="flex items-center gap-8px border-b border-theme-naive pb-12px text-15px font-600">
      <SvgIcon icon="carbon:activity" class="text-16px text-primary" />
      {{ $t("page.home.dashboard.appStatus") }}
    </div>

    <div class="health-check-list mt-2px divide-y">
      <div
        v-for="metric in metrics"
        :key="metric.label"
        class="flex items-center gap-10px px-2px py-10px transition-colors duration-200 hover:bg-theme-modal"
      >
        <span class="flex-center size-28px rd-8px bg-theme-modal" :class="metric.tone">
          <SvgIcon :icon="metric.icon" class="text-14px" />
        </span>
        <span class="min-w-0 flex-1 truncate text-12px">{{ metric.label }}</span>
        <span class="text-13px font-600 tabular-nums" :class="metric.tone">{{ metric.value }}</span>
        <div>
          <NTooltip>
            <template #trigger>
              <span class="inline-flex cursor-pointer flex-shrink-0">
                <SvgIcon icon="carbon:help" class="text-12px text-base-text-4" />
              </span>
            </template>
            {{ metric.tip }}
          </NTooltip>
        </div>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
  .health-check-list > :not([hidden]) ~ :not([hidden]) {
    border-color: var(--n-border-color);
  }
</style>

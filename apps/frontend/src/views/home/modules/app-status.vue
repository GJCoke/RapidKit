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
      accent: "56, 158, 13",
      tip: $t("page.home.dashboard.qpsTip"),
    },
    {
      value: fmt(props.healthStats.p50Ms, "ms"),
      label: "P50",
      icon: "carbon:timer",
      accent: "32, 128, 240",
      tip: $t("page.home.dashboard.p50Tip"),
    },
    {
      value: fmt(props.healthStats.p95Ms, "ms"),
      label: "P95",
      icon: "carbon:time",
      accent: "114, 46, 209",
      tip: $t("page.home.dashboard.p95Tip"),
    },
    {
      value: fmt(props.healthStats.http5xx1h),
      label: $t("page.home.dashboard.http5xx"),
      icon: "carbon:close-outline",
      accent: "208, 48, 80",
      tip: $t("page.home.dashboard.http5xxTip"),
    },
    {
      value: fmt(props.healthStats.bizErrors1h),
      label: $t("page.home.dashboard.bizErrors"),
      icon: "carbon:warning",
      accent: "240, 160, 32",
      tip: $t("page.home.dashboard.bizErrorsTip"),
    },
    {
      value: fmt(props.healthStats.wsConnections),
      label: $t("page.home.dashboard.wsConnections"),
      icon: "carbon:connect",
      accent: "32, 128, 240",
      tip: $t("page.home.dashboard.wsConnectionsTip"),
    },
  ])
</script>

<template>
  <NCard :bordered="false" class="card-wrapper">
    <div class="flex items-center gap-8px text-15px font-600 mb-14px">
      <SvgIcon icon="carbon:activity" class="text-16px text-primary" />
      {{ $t("page.home.dashboard.appStatus") }}
    </div>

    <div class="grid grid-cols-2 gap-12px sm:grid-cols-3 lg:grid-cols-6">
      <div
        v-for="metric in metrics"
        :key="metric.label"
        class="relative flex flex-col gap-6px px-14px py-12px rd-10px transition-all duration-200 border border-solid hover:shadow-sm"
        :style="{
          background: `rgba(${metric.accent}, 0.05)`,
          borderColor: `rgba(${metric.accent}, 0.08)`,
          '--accent': metric.accent,
        }"
        @mouseenter="
          ;($event.currentTarget as HTMLElement).style.background = `rgba(${metric.accent}, 0.1)`
          ;($event.currentTarget as HTMLElement).style.borderColor = `rgba(${metric.accent}, 0.18)`
        "
        @mouseleave="
          ;($event.currentTarget as HTMLElement).style.background = `rgba(${metric.accent}, 0.05)`
          ;($event.currentTarget as HTMLElement).style.borderColor = `rgba(${metric.accent}, 0.08)`
        "
      >
        <div class="flex items-center gap-6px">
          <SvgIcon :icon="metric.icon" class="text-13px" :style="{ color: `rgb(${metric.accent})` }" />
          <span class="text-12px text-[var(--text-color-3)] truncate">{{ metric.label }}</span>
          <NTooltip>
            <template #trigger>
              <span class="inline-flex cursor-pointer flex-shrink-0">
                <SvgIcon icon="carbon:help" class="text-12px text-[var(--text-color-4)]" />
              </span>
            </template>
            {{ metric.tip }}
          </NTooltip>
        </div>
        <span class="text-22px font-700 tabular-nums leading-none" :style="{ color: `rgb(${metric.accent})` }">
          {{ metric.value }}
        </span>
      </div>
    </div>
  </NCard>
</template>

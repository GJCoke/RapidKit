<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardAppStatus" })

  const props = defineProps<{
    healthStats: Api.Dashboard.HealthStats
    businessSummary: Api.Dashboard.BusinessSummary | null
  }>()

  const fmt = (v: number | null | undefined, suffix = "") => (v == null ? "—" : `${v}${suffix}`)
  const appHealthy = computed(() => props.healthStats.http5Xx1H === 0 && props.healthStats.bizErrors1H === 0)

  const healthMetrics = computed(() => [
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
  ])

  const businessMetrics = computed(() => {
    if (!props.businessSummary) return []
    return [
      { label: $t("page.home.dashboard.roles"), value: props.businessSummary.roles, icon: "carbon:user-role" },
      { label: $t("page.home.dashboard.menus"), value: props.businessSummary.menus, icon: "carbon:menu" },
      { label: $t("page.home.dashboard.apiRouters"), value: props.businessSummary.routers, icon: "carbon:api" },
      { label: $t("page.home.dashboard.scripts"), value: props.businessSummary.scripts, icon: "carbon:code" },
      { label: $t("page.home.dashboard.schedules"), value: props.businessSummary.schedules, icon: "carbon:time" },
    ]
  })
</script>

<template>
  <NCard
    bordered
    class="app-status-card h-full"
    content-style="padding: 0; height: 100%; display: flex; flex-direction: column"
  >
    <div class="flex items-center justify-between gap-16px px-18px py-14px sm:px-20px sm:py-16px">
      <div class="flex min-w-0 items-center gap-11px">
        <span class="flex-center size-34px flex-shrink-0 rd-10px bg-theme-modal">
          <SvgIcon
            icon="carbon:security-services"
            class="text-19px"
            :class="appHealthy ? 'text-success' : 'text-warning'"
          />
        </span>
        <div class="min-w-0">
          <h2 class="m-0 text-16px font-700 text-base-text-1">{{ $t("page.home.dashboard.appStatus") }}</h2>
          <p class="m-0 mt-2px truncate text-11px text-base-text-3">
            {{ $t("page.home.dashboard.healthAndBusiness") }}
          </p>
        </div>
      </div>
      <span
        class="inline-flex flex-shrink-0 items-center gap-6px text-12px"
        :class="appHealthy ? 'text-success' : 'text-warning'"
      >
        <span class="size-7px rd-full" :class="appHealthy ? 'bg-success' : 'bg-warning'" />
        {{ appHealthy ? $t("page.home.dashboard.healthy") : $t("page.home.dashboard.degraded") }}
      </span>
    </div>

    <section class="flex flex-1 flex-col border-t border-theme-naive px-18px pb-4px pt-4px sm:px-20px">
      <div class="health-check-list flex flex-1 flex-col divide-y">
        <div
          v-for="metric in healthMetrics"
          :key="metric.label"
          class="health-check-row flex min-h-51px flex-1 items-center gap-10px py-7px transition-colors duration-200 hover:bg-theme-modal"
        >
          <SvgIcon :icon="metric.icon" class="flex-shrink-0 text-16px text-base-text-3" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-13px font-500 text-base-text-1">{{ metric.label }}</div>
            <div class="mt-1px truncate text-11px leading-15px text-base-text-3">{{ metric.tip }}</div>
          </div>
          <span class="whitespace-nowrap text-13px font-600 tabular-nums" :class="metric.tone">{{ metric.value }}</span>
          <NTooltip>
            <template #trigger>
              <span class="inline-flex cursor-pointer flex-shrink-0">
                <SvgIcon icon="carbon:help" class="text-13px text-base-text-4" />
              </span>
            </template>
            {{ metric.tip }}
          </NTooltip>
        </div>
      </div>
    </section>

    <section
      v-if="businessMetrics.length"
      class="mt-auto border-t border-theme-naive px-18px pb-15px pt-12px sm:px-20px"
    >
      <div class="mb-11px flex items-center gap-7px text-12px font-600 text-base-text-2">
        <SvgIcon icon="carbon:data-structured" class="text-15px text-primary" />
        {{ $t("page.home.dashboard.businessScale") }}
      </div>
      <div class="grid grid-cols-5">
        <div
          v-for="(metric, index) in businessMetrics"
          :key="metric.label"
          class="business-metric min-w-0 text-center"
          :class="index ? 'border-l border-theme-naive' : ''"
        >
          <SvgIcon :icon="metric.icon" class="mx-auto text-16px text-primary" />
          <div class="mt-5px truncate text-11px text-base-text-3">{{ metric.label }}</div>
          <div class="mt-2px text-16px font-700 tabular-nums text-base-text-1">{{ metric.value }}</div>
        </div>
      </div>
    </section>
  </NCard>
</template>

<style scoped>
  .app-status-card {
    border-color: var(--n-border-color);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgb(15 23 42 / 4%);
  }

  .health-check-list > :not([hidden]) ~ :not([hidden]) {
    border-color: var(--n-border-color);
  }

  .health-check-row {
    margin-inline: -4px;
    padding-inline: 4px;
  }
</style>

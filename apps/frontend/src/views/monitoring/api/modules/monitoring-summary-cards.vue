<script setup lang="ts">
  import { computed } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "MonitoringSummaryCards" })

  const props = defineProps<{
    overview: Api.Monitoring.ApiOverview
  }>()

  const theme = useThemeVars()

  const cards = computed(() => [
    {
      key: "requests",
      title: $t("page.monitoring.api.totalRequests"),
      value: props.overview.totalRequests.toLocaleString(),
      icon: "carbon:http",
      gradient: `linear-gradient(135deg, ${theme.value.primaryColor} 0%, ${theme.value.primaryColorHover} 100%)`,
    },
    {
      key: "errors",
      title: $t("page.monitoring.api.totalErrors"),
      value: props.overview.totalErrors.toLocaleString(),
      icon: "carbon:warning-alt",
      gradient: `linear-gradient(135deg, ${theme.value.errorColor} 0%, ${theme.value.errorColorHover} 100%)`,
    },
    {
      key: "errorRate",
      title: $t("page.monitoring.api.avgErrorRate"),
      value: `${props.overview.avgErrorRate}%`,
      icon: "carbon:misuse-outline",
      gradient: `linear-gradient(135deg, ${theme.value.warningColor} 0%, ${theme.value.warningColorHover} 100%)`,
    },
    {
      key: "avgMs",
      title: $t("page.monitoring.api.avgResponseTime"),
      value: `${props.overview.avgMs} ms`,
      icon: "carbon:timer",
      gradient: `linear-gradient(135deg, ${theme.value.infoColor} 0%, ${theme.value.infoColorHover} 100%)`,
    },
  ])
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-16px">
    <NCard v-for="card in cards" :key="card.key" :bordered="false" class="card-wrapper group" hoverable>
      <div class="flex items-center gap-16px">
        <div
          class="flex-center size-46px min-w-46px rd-12px shadow-sm transition-transform duration-250 group-hover:scale-108"
          :style="{ background: card.gradient }"
        >
          <SvgIcon :icon="card.icon" class="text-22px text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-13px text-[var(--text-color-3)] truncate">{{ card.title }}</div>
          <div class="text-24px font-700 tracking-tight leading-none mt-4px">{{ card.value }}</div>
        </div>
      </div>
    </NCard>
  </div>
</template>

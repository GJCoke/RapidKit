<script setup lang="ts">
  import { computed } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "PluginStats" })

  const props = defineProps<{
    stats: { total: number; loaded: number; disabled: number; failed: number }
    loading: boolean
  }>()

  const themeVars = useThemeVars()

  const theme = themeVars

  const cards = computed(() => [
    {
      key: "total",
      title: $t("page.monitoring.plugin.totalPlugins"),
      value: props.stats.total,
      icon: "carbon:plug",
      gradient: `linear-gradient(135deg, ${theme.value.primaryColor} 0%, ${theme.value.primaryColorHover} 100%)`,
    },
    {
      key: "loaded",
      title: $t("page.monitoring.plugin.loaded"),
      value: props.stats.loaded,
      icon: "carbon:checkmark-filled",
      gradient: `linear-gradient(135deg, ${theme.value.successColor} 0%, ${theme.value.successColorHover} 100%)`,
    },
    {
      key: "disabled",
      title: $t("page.monitoring.plugin.disabled"),
      value: props.stats.disabled,
      icon: "carbon:subtract-filled",
      gradient: `linear-gradient(135deg, ${theme.value.warningColor} 0%, ${theme.value.warningColorHover} 100%)`,
    },
    {
      key: "failed",
      title: $t("page.monitoring.plugin.failed"),
      value: props.stats.failed,
      icon: "carbon:close-filled",
      gradient: `linear-gradient(135deg, ${theme.value.errorColor} 0%, ${theme.value.errorColorHover} 100%)`,
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
        <div>
          <div class="text-13px text-[var(--text-color-3)]">{{ card.title }}</div>
          <div class="text-26px font-700 tracking-tight leading-none mt-4px tabular-nums">
            <NSpin v-if="loading" :size="16" />
            <span v-else>{{ card.value }}</span>
          </div>
        </div>
      </div>
    </NCard>
  </div>
</template>

<script setup lang="ts">
  import { computed } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardStatCards" })

  const props = defineProps<{
    userSummary: Api.Dashboard.UserStatsSummary
    onlineUsers: number
    workerCount: number
    taskSummary: Api.Worker.TaskStatsSummary
    errorStats: Api.Dashboard.ErrorStats
  }>()

  const theme = useThemeVars()

  interface CardItem {
    key: string
    title: string
    value: number | string
    icon: string
    gradient: string
    delta?: number
    suffix?: string
    deltaColor?: string
  }

  const cards = computed<CardItem[]>(() => {
    const p = theme.value.primaryColor
    const s = theme.value.successColor
    const w = theme.value.warningColor
    const e = theme.value.errorColor
    const i = theme.value.infoColor

    return [
      {
        key: "users",
        title: $t("page.home.dashboard.userTotal"),
        value: props.userSummary.total,
        icon: "carbon:user-multiple",
        gradient: `linear-gradient(135deg, ${p} 0%, ${theme.value.primaryColorHover} 100%)`,
        delta: props.userSummary.todayNew,
        suffix: $t("page.home.dashboard.todayNew"),
        deltaColor: p,
      },
      {
        key: "online",
        title: $t("page.home.dashboard.onlineUsers"),
        value: props.onlineUsers,
        icon: "carbon:connection-signal",
        gradient: `linear-gradient(135deg, ${s} 0%, ${theme.value.successColorHover} 100%)`,
      },
      {
        key: "workers",
        title: $t("page.home.dashboard.workerCount"),
        value: props.workerCount,
        icon: "carbon:server-dns",
        gradient: `linear-gradient(135deg, ${w} 0%, ${theme.value.warningColorHover} 100%)`,
      },
      {
        key: "tasks",
        title: $t("page.home.dashboard.todayTasks"),
        value: props.taskSummary.total,
        icon: "carbon:task-complete",
        gradient: `linear-gradient(135deg, ${i} 0%, ${theme.value.infoColorHover} 100%)`,
        delta: props.taskSummary.success,
        suffix: $t("page.home.dashboard.success"),
        deltaColor: s,
      },
      {
        key: "errors",
        title: $t("page.home.dashboard.apiErrorRate"),
        value: `${props.errorStats.errorRate}%`,
        icon: "carbon:warning-alt",
        gradient: `linear-gradient(135deg, ${e} 0%, ${theme.value.errorColorHover} 100%)`,
      },
    ]
  })
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-16px">
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
          <div class="flex items-baseline gap-8px mt-4px">
            <span class="text-26px font-700 tracking-tight leading-none">{{ card.value }}</span>
            <span
              v-if="card.delta !== undefined"
              class="inline-flex items-center gap-2px text-12px"
              :style="{ color: card.deltaColor }"
            >
              <SvgIcon icon="carbon:arrow-up" class="text-10px" />
              +{{ card.delta }} {{ card.suffix }}
            </span>
          </div>
        </div>
      </div>
    </NCard>
  </div>
</template>

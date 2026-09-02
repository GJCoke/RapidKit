<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"

  defineOptions({ name: "DashboardStatCards" })

  const props = defineProps<{
    userSummary: Api.Dashboard.UserStatsSummary
    onlineUsers: number
    workerCount: number
    taskSummary: Api.Worker.TaskStatsSummary
    errorStats: Api.Dashboard.ErrorStats
  }>()

  interface CardItem {
    key: string
    title: string
    value: number | string
    icon: string
    iconClass: string
    delta?: number
    suffix?: string
    deltaClass?: string
  }

  const cards = computed<CardItem[]>(() => {
    return [
      {
        key: "users",
        title: $t("page.home.dashboard.userTotal"),
        value: props.userSummary.total,
        icon: "carbon:user-multiple",
        iconClass: "text-primary bg-primary-50 dark:bg-primary-950",
        delta: props.userSummary.todayNew,
        suffix: $t("page.home.dashboard.todayNew"),
        deltaClass: "text-primary",
      },
      {
        key: "online",
        title: $t("page.home.dashboard.onlineUsers"),
        value: props.onlineUsers,
        icon: "carbon:connection-signal",
        iconClass: "text-success bg-success-50 dark:bg-success-950",
      },
      {
        key: "workers",
        title: $t("page.home.dashboard.workerCount"),
        value: props.workerCount,
        icon: "carbon:server-dns",
        iconClass: "text-warning bg-warning-50 dark:bg-warning-950",
      },
      {
        key: "tasks",
        title: $t("page.home.dashboard.todayTasks"),
        value: props.taskSummary.total,
        icon: "carbon:task-complete",
        iconClass: "text-info bg-info-50 dark:bg-info-950",
        delta: props.taskSummary.success,
        suffix: $t("page.home.dashboard.success"),
        deltaClass: "text-success",
      },
      {
        key: "errors",
        title: $t("page.home.dashboard.apiErrorRate"),
        value: `${props.errorStats.errorRate}%`,
        icon: "carbon:warning-alt",
        iconClass: "text-error bg-error-50 dark:bg-error-950",
      },
    ]
  })
</script>

<template>
  <NCard :bordered="false" class="card-wrapper overview-strip" content-style="padding: 0">
    <div class="grid grid-cols-2 xl:grid-cols-5">
      <div
        v-for="(card, index) in cards"
        :key="card.key"
        class="group flex items-center gap-12px px-16px py-15px transition-colors duration-200 hover:bg-theme-modal"
        :class="[
          index % 2 ? 'border-l border-theme-naive' : '',
          index > 1 ? 'border-t border-theme-naive xl:border-t-0' : '',
          index > 0 ? 'xl:border-l xl:border-theme-naive' : '',
        ]"
      >
        <span class="flex-center size-34px min-w-34px rd-9px" :class="card.iconClass">
          <SvgIcon :icon="card.icon" class="text-17px" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-12px text-base-text-3">{{ card.title }}</div>
          <div class="mt-5px flex flex-wrap items-baseline gap-x-7px gap-y-3px">
            <span class="text-22px font-700 leading-none tracking-tight tabular-nums">{{ card.value }}</span>
            <span
              v-if="card.delta !== undefined"
              class="inline-flex items-center gap-2px text-11px"
              :class="card.deltaClass"
            >
              <SvgIcon icon="carbon:arrow-up" class="text-9px" />
              +{{ card.delta }} {{ card.suffix }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </NCard>
</template>

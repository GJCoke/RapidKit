<script setup lang="ts">
  import dayjs from "dayjs"
  import relativeTime from "dayjs/plugin/relativeTime"
  import "dayjs/locale/zh-cn"
  import { $t } from "@/locales"

  dayjs.extend(relativeTime)

  defineOptions({ name: "DashboardActivityFeed" })

  defineProps<{
    activities: Api.Dashboard.ActivityItem[]
  }>()

  type TimelineType = "success" | "error" | "warning" | "info" | "default"

  function eventColor(eventType: string): TimelineType {
    if (eventType === "user_login") return "info"
    if (eventType === "task_success") return "success"
    if (eventType === "task_failure" || eventType === "system_error") return "error"
    if (eventType === "worker_online" || eventType === "worker_offline") return "warning"
    if (eventType === "business_error") return "warning"
    return "default"
  }

  function activityTitle(item: Api.Dashboard.ActivityItem) {
    const key = `page.home.dashboard.activity.${item.eventType}` as I18nFullKey
    const translated = $t(key, item.params)
    return translated === key ? JSON.stringify(item.params) : translated
  }

  function relativeTimeStr(time: string) {
    return dayjs(time).locale("zh-cn").fromNow()
  }
</script>

<template>
  <div class="card-wrapper h-full flex flex-col overflow-hidden bg-container p-20px">
    <div class="flex items-center gap-8px text-15px font-600 mb-16px shrink-0">
      <SvgIcon icon="carbon:recently-viewed" class="text-16px text-primary" />
      {{ $t("page.home.dashboard.activityFeed") }}
    </div>

    <NScrollbar class="flex-1 min-h-0">
      <NTimeline v-if="activities.length">
        <NTimelineItem
          v-for="item in activities"
          :key="item.id"
          :type="eventColor(item.eventType)"
          :title="activityTitle(item)"
          :time="relativeTimeStr(item.createTime)"
          :content="item.detail || undefined"
        />
      </NTimeline>
      <div v-else class="flex-center flex-col gap-12px py-48px text-[var(--text-color-3)]">
        <SvgIcon icon="carbon:no-image" class="text-36px opacity-40" />
        <span class="text-13px">{{ $t("page.home.dashboard.noActivity") }}</span>
      </div>
    </NScrollbar>
  </div>
</template>

<script setup lang="ts">
  import dayjs from "dayjs"
  import relativeTime from "dayjs/plugin/relativeTime"
  import "dayjs/locale/zh-cn"
  import { $t } from "@/locales"
  import { useAppStore } from "@/store/modules/app"

  dayjs.extend(relativeTime)

  defineOptions({ name: "DashboardActivityFeed" })

  const props = defineProps<{
    activities: Api.Dashboard.ActivityItem[]
    auditDict: {
      resource: Record<string, { zh: string; en: string }>
      action: Record<string, { zh: string; en: string }>
    }
  }>()

  const appStore = useAppStore()

  type TimelineType = "success" | "error" | "warning" | "info" | "default"

  function eventColor(eventType: string): TimelineType {
    if (eventType === "auth.login" || eventType === "auth.logout") return "info"
    if (eventType.endsWith(".create")) return "success"
    if (eventType.endsWith(".delete")) return "error"
    if (eventType.endsWith(".update")) return "warning"
    return "default"
  }

  function activityTitle(item: Api.Dashboard.ActivityItem) {
    const parts = item.eventType.split(".")
    if (parts.length < 2) return item.eventType

    const [resource, action] = parts
    const locale = appStore.locale === "zh-CN" ? "zh" : "en"

    const resourceLabel = props.auditDict.resource[resource]?.[locale] ?? resource
    const actionLabel = props.auditDict.action[action]?.[locale] ?? action
    let operator = item.username ?? ""
    let target = item.params?.target ?? ""

    // Login has no JWT yet — target holds the username
    if (!operator && target) {
      operator = target
      target = ""
    } else if (operator === target) {
      target = ""
    }

    return `${operator} ${actionLabel} ${resourceLabel} ${target}`.trim()
  }

  function relativeTimeStr(time: string) {
    const dayjsLocale = appStore.locale === "zh-CN" ? "zh-cn" : "en"
    return dayjs(time).locale(dayjsLocale).fromNow()
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

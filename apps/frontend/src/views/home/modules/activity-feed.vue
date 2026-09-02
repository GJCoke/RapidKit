<script setup lang="ts">
  import dayjs from "dayjs"
  import "dayjs/locale/zh-cn"
  import relativeTime from "dayjs/plugin/relativeTime"
  import { $t } from "@/locales"
  import { useAppStore } from "@/store/modules/app"

  dayjs.extend(relativeTime)

  defineOptions({ name: "DashboardActivityFeed" })

  type Category = "all" | Api.Dashboard.ActivityCategory
  type TimelineType = "success" | "error" | "warning" | "info" | "default"

  defineProps<{
    activities: Api.Dashboard.ActivityItem[]
    category: Category
  }>()

  const emit = defineEmits<{
    categoryChange: [category: Category]
  }>()

  const appStore = useAppStore()
  const categories = [
    { value: "all", label: "page.home.dashboard.activityCategory.all" },
    { value: "task", label: "page.home.dashboard.activityCategory.task" },
    { value: "user", label: "page.home.dashboard.activityCategory.user" },
    { value: "system", label: "page.home.dashboard.activityCategory.system" },
    { value: "alert", label: "page.home.dashboard.activityCategory.alert" },
  ] as const

  const categoryIcons: Record<Api.Dashboard.ActivityCategory, string> = {
    task: "carbon:task",
    user: "carbon:user",
    system: "carbon:settings",
    alert: "carbon:warning-alt",
  }

  function timelineType(level: Api.Dashboard.ActivityLevel): TimelineType {
    return level === "success" || level === "error" || level === "warning" || level === "info" ? level : "default"
  }

  function relativeTimeStr(time: string) {
    return dayjs(time)
      .locale(appStore.locale === "zh-CN" ? "zh-cn" : "en")
      .fromNow()
  }
</script>

<template>
  <div class="card-wrapper h-400px flex flex-col overflow-hidden bg-container p-20px">
    <div class="mb-12px flex shrink-0 items-center justify-between gap-12px">
      <div class="flex items-center gap-8px text-15px font-600">
        <SvgIcon icon="carbon:recently-viewed" class="text-16px text-primary" />
        {{ $t("page.home.dashboard.activityFeed") }}
      </div>
      <div class="flex flex-wrap justify-end gap-4px">
        <NButton
          v-for="item in categories"
          :key="item.value"
          size="tiny"
          :type="category === item.value ? 'primary' : 'default'"
          :secondary="category === item.value"
          @click="emit('categoryChange', item.value)"
        >
          {{ $t(item.label as any) }}
        </NButton>
      </div>
    </div>

    <NScrollbar class="flex-1 min-h-0">
      <NTimeline v-if="activities.length" class="pt-4px">
        <NTimelineItem
          v-for="item in activities"
          :key="item.id"
          :type="timelineType(item.level)"
          :time="relativeTimeStr(item.occurredAt)"
        >
          <div class="flex items-start gap-8px">
            <SvgIcon :icon="categoryIcons[item.category]" class="mt-2px shrink-0 text-16px" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-6px">
                <NTag size="small" :type="timelineType(item.level)">
                  {{ $t(`page.home.dashboard.activityCategory.${item.category}` as any) }}
                </NTag>
                <span class="text-13px text-[var(--text-color-1)]">
                  {{ $t(item.titleKey as any, item.titleParams) }}
                </span>
              </div>
              <div v-if="item.descriptionKey" class="mt-4px text-12px text-[var(--text-color-3)]">
                {{ $t(item.descriptionKey as any, item.descriptionParams) }}
              </div>
            </div>
          </div>
        </NTimelineItem>
      </NTimeline>
      <div v-else class="flex-center flex-col gap-12px py-48px text-[var(--text-color-3)]">
        <SvgIcon icon="carbon:no-image" class="text-36px opacity-40" />
        <span class="text-13px">{{ $t("page.home.dashboard.noActivity") }}</span>
      </div>
    </NScrollbar>
  </div>
</template>

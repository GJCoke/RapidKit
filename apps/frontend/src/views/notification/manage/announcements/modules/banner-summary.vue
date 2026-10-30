<script setup lang="ts">
  import { computed } from "vue"
  import { formatApiTime } from "@/utils/datetime"
  import { useThemeVars } from "naive-ui"
  import NotificationLevel from "@/components/notification/notification-level.vue"
  import { renderContent, renderTitle } from "@/utils/notification/content-render"
  import { $t } from "@/locales"
  defineOptions({ name: "BannerSummary" })

  const props = defineProps<{
    check: Api.Notification.BannerCheck
    delivery?: "now" | "scheduled"
    messageId?: string | null
    confirmation?: boolean
  }>()
  const themeVars = useThemeVars()
  const t = (key: string) => $t(`page.notification.banner.${key}` as I18nFullKey)
  const entries = computed(() => [
    {
      key: "current",
      heading: "current",
      empty: "noneCurrent",
      hint: "emptyCurrentHint",
      icon: "carbon:bullhorn",
      item: props.check.current,
    },
    {
      key: "scheduled",
      heading: "upcoming",
      empty: "noneUpcoming",
      hint: "emptyUpcomingHint",
      icon: "carbon:time",
      item: props.check.scheduled,
    },
  ])
  const time = (value?: string | null) => (value ? formatApiTime(value, undefined, "YYYY-MM-DD HH:mm") : t("unlimited"))
</script>
<template>
  <div
    :style="{
      '--border-color': themeVars.borderColor,
      '--fill-color': themeVars.actionColor,
      '--text-color-1': themeVars.textColor1,
      '--text-color-2': themeVars.textColor2,
      '--text-color-3': themeVars.textColor3,
    }"
  >
    <div class="grid gap-12px text-13px" :class="confirmation ? '' : 'md:grid-cols-2'">
      <section
        v-for="entry in entries"
        :key="entry.key"
        class="min-w-0 flex-col overflow-hidden rounded-8px border border-theme-default"
        :aria-label="t(entry.heading)"
      >
        <header class="flex items-center justify-between gap-12px bg-theme-fill px-16px py-10px">
          <div class="flex min-w-0 items-center gap-8px font-500">
            <SvgIcon :icon="entry.icon" aria-hidden="true" class="shrink-0 text-16px text-base-text-3" />
            <span>{{ t(entry.heading) }}</span>
          </div>
          <span
            v-if="entry.item && !confirmation"
            class="inline-flex shrink-0 items-center gap-6px rounded-4px px-8px py-2px text-12px"
            :class="entry.key === 'current' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'"
          >
            <span class="h-5px w-5px rounded-full bg-current" aria-hidden="true"></span>
            {{ t(entry.key === "current" ? "active" : "scheduled") }}
          </span>
        </header>
        <template v-if="entry.item">
          <div class="flex-1 p-16px" :class="confirmation ? '' : 'min-h-130px'">
            <div class="flex items-start justify-between gap-12px">
              <h3 class="m-0 min-w-0 break-words text-15px font-600 leading-22px text-base-text-1">
                {{ renderTitle(entry.item) }}
              </h3>
              <NotificationLevel :level="entry.item.level" />
            </div>
            <p
              v-if="!confirmation"
              class="mb-0 mt-6px line-clamp-2 whitespace-pre-line break-words leading-20px text-base-text-3"
            >
              {{ renderContent(entry.item) }}
            </p>
            <dl class="mb-0 mt-14px grid grid-cols-2 gap-x-16px gap-y-10px text-12px">
              <div class="min-w-0">
                <dt class="text-base-text-3">{{ t("startsAt") }}</dt>
                <dd class="m-0 mt-3px break-words font-500 tabular-nums">
                  {{ time(entry.item.publishAt ?? entry.item.publishedAt) }}
                </dd>
              </div>
              <div class="min-w-0">
                <dt class="text-base-text-3">{{ t("endsAt") }}</dt>
                <dd class="m-0 mt-3px break-words font-500 tabular-nums">{{ time(entry.item.expireAt) }}</dd>
              </div>
            </dl>
          </div>
          <footer
            v-if="!confirmation && $slots[entry.key]"
            class="flex flex-wrap items-center justify-end gap-8px border-t border-theme-default px-16px py-10px"
          >
            <slot :name="entry.key" :item="entry.item"></slot>
          </footer>
        </template>
        <div v-else class="flex flex-1 items-center gap-12px p-16px" :class="confirmation ? '' : 'min-h-130px'">
          <span
            v-if="!confirmation"
            class="flex-center h-40px w-40px shrink-0 rounded-8px bg-theme-fill text-base-text-3"
          >
            <SvgIcon :icon="entry.icon" aria-hidden="true" class="text-20px" />
          </span>
          <div>
            <p class="m-0 text-base-text-2">{{ t(entry.empty) }}</p>
            <p v-if="!confirmation" class="mb-0 mt-6px text-12px leading-20px text-base-text-3">{{ t(entry.hint) }}</p>
          </div>
        </div>
      </section>
    </div>
    <NAlert v-if="confirmation" type="warning" class="mt-12px" :show-icon="true">
      <template v-if="delivery === 'now'">
        <p class="m-0">{{ t(check.current ? "replaceNowWarning" : "publishNowHint") }}</p>
        <p v-if="check.scheduled" class="mb-0 mt-8px">{{ t("keepUpcomingWarning") }}</p>
      </template>
      <template v-else>
        <p class="m-0">{{ t("scheduleReplaceWarning") }}</p>
        <p v-if="check.scheduled && check.scheduled.id !== messageId" class="mb-0 mt-8px">
          {{ t("replaceUpcomingWarning") }}
        </p>
      </template>
      <p class="mb-0 mt-8px">{{ t("noRestore") }}</p>
    </NAlert>
  </div>
</template>

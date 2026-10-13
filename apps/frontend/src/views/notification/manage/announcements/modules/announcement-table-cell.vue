<script setup lang="ts">
  import { computed } from "vue"
  import dayjs from "dayjs"
  import { renderTitle, renderContent } from "@/utils/notification/content-render"
  import { $t } from "@/locales"
  import { announcementCategory, announcementStatus, announcementTableText as t } from "./announcement-table"

  defineOptions({ name: "AnnouncementTableCell" })
  const props = defineProps<{
    row: Api.Notification.AnnouncementItem
    kind: "content" | "display" | "status" | "time"
  }>()
  const emit = defineEmits<{ detail: [] }>()
  const status = computed(() => announcementStatus(props.row))
  const startsAt = computed(() => props.row.publishedAt ?? props.row.publishAt)
  const summary = computed(() => {
    const content = renderContent(props.row).replace(/\s+/g, " ").trim()
    return content.length > 200 ? `${content.slice(0, 200)}…` : content || t("emptyContent")
  })
  const date = (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
</script>

<template>
  <div v-if="kind === 'content'" class="min-w-0 py-6px">
    <button
      type="button"
      class="block w-full cursor-pointer border-0 bg-transparent px-6px py-0 text-left text-14px font-600 leading-21px text-base-text-1 transition-colors hover:text-primary focus-visible:outline-theme-primary"
      @click="emit('detail')"
    >
      <span class="line-clamp-2 break-all">{{ renderTitle(row) }}</span>
    </button>
    <div class="mt-5px flex items-center gap-8px text-12px leading-20px text-base-text-3">
      <span class="max-w-120px shrink-0 truncate rd-4px bg-theme-fill px-6px" :title="row.category">{{
        announcementCategory(row.category)
      }}</span>
      <span class="min-w-0 truncate">{{ summary }}</span>
    </div>
  </div>
  <div v-else-if="kind === 'display'" class="flex items-center gap-6px text-13px leading-20px text-base-text-2">
    <SvgIcon
      :icon="row.displayMode === 'top_banner' ? 'carbon:notification-new' : 'carbon:email'"
      class="shrink-0 text-16px text-base-text-3"
      aria-hidden="true"
    />
    <span class="min-w-0 break-words">{{
      row.displayMode === "top_banner"
        ? $t("page.notification.banner.topBanner" as I18nFullKey)
        : $t("page.notification.manage.announcements.editor.inApp" as I18nFullKey)
    }}</span>
  </div>
  <NTag v-else-if="kind === 'status'" :type="status.type" size="small" :bordered="false">{{ status.label }}</NTag>
  <div v-else class="flex-col gap-4px whitespace-nowrap text-12px leading-20px tabular-nums">
    <span class="text-base-text-2"
      ><span class="mr-6px text-base-text-3">{{ t(!row.publishedAt && row.publishAt ? "planned" : "start") }}</span
      >{{ startsAt ? date(startsAt) : t("unpublished") }}</span
    >
    <span class="text-base-text-3"
      ><span class="mr-6px">{{ t("end") }}</span
      >{{ row.expireAt ? date(row.expireAt) : $t("page.notification.banner.unlimited" as I18nFullKey) }}</span
    >
  </div>
</template>

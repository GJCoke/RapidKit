<script setup lang="ts">
  import { ref, watch } from "vue"
  import { formatApiTime } from "@/utils/datetime"
  import { fetchGetAnnouncement } from "@/service/api"
  import NotificationLevel from "@/components/notification/notification-level.vue"
  import { renderTitle, renderContent } from "@/utils/notification/content-render"
  import { $t } from "@/locales"
  import { announcementCategory, announcementStatus, announcementTableText as tt } from "./announcement-table"

  defineOptions({ name: "AnnouncementDetail" })
  const props = defineProps<{ messageId: string | null }>()
  const visible = defineModel<boolean>("visible", { default: false })
  const data = ref<Api.Notification.AnnouncementDetail | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let epoch = 0
  const t = (key: string) => $t(`page.notification.banner.${key}` as I18nFullKey)
  watch([visible, () => props.messageId], async ([shown, id]) => {
    const request = ++epoch
    data.value = null
    failed.value = false
    if (!shown || !id) return
    loading.value = true
    try {
      const result = await fetchGetAnnouncement(id)
      if (request !== epoch) return
      if (result.error || !result.data) failed.value = true
      else data.value = result.data
    } finally {
      if (request === epoch) loading.value = false
    }
  })
</script>
<template>
  <NDrawer v-model:show="visible" placement="right" :width="680" class="max-w-full">
    <NDrawerContent :title="t('detailTitle')" closable :native-scrollbar="false">
      <NSpin :show="loading" class="min-h-120px">
        <NAlert v-if="failed" type="error">{{
          $t("page.notification.manage.announcements.editor.loadFailed" as I18nFullKey)
        }}</NAlert>
        <template v-if="data">
          <div class="flex items-center gap-10px">
            <NotificationLevel :level="data.level" /><NTag size="small">{{
              data.displayMode === "top_banner"
                ? t("topBanner")
                : $t("page.notification.manage.announcements.editor.inApp" as I18nFullKey)
            }}</NTag>
            <NTag size="small" :bordered="false" :type="announcementStatus(data).type">{{
              announcementStatus(data).label
            }}</NTag>
          </div>
          <h2 class="my-14px break-words text-18px">{{ renderTitle(data) }}</h2>
          <p class="m-0 whitespace-pre-wrap break-words leading-24px">{{ renderContent(data) }}</p>
          <div class="mt-20px border-t border-theme-default pt-12px text-12px leading-24px text-base-text-3">
            <p class="m-0">
              {{ $t("page.notification.manage.announcements.category" as I18nFullKey) }}：{{
                announcementCategory(data.category)
              }}
            </p>
            <p class="m-0">
              {{ t("startsAt") }}：{{
                data.publishAt || data.publishedAt
                  ? formatApiTime(data.publishAt ?? data.publishedAt, undefined, "YYYY-MM-DD HH:mm")
                  : tt("unpublished")
              }}
            </p>
            <p class="m-0">
              {{ t("endsAt") }}：{{
                data.expireAt ? formatApiTime(data.expireAt, undefined, "YYYY-MM-DD HH:mm") : t("unlimited")
              }}
            </p>
            <p v-if="data.supersededAt" class="m-0">
              {{ t("superseded") }}：{{ formatApiTime(data.supersededAt, undefined, "YYYY-MM-DD HH:mm") }}
            </p>
          </div>
        </template>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>

<script setup lang="ts">
  import { announcementCategory } from "../../announcements/modules/announcement-table"
  import { deliveryMessageTitle, deliveryTime, deliveryText as t } from "./delivery-presentation"
  import { $t } from "@/locales"

  defineOptions({ name: "DeliveryMessage" })
  defineProps<{ message: Api.Notification.DeliveryMessage | null; canView?: boolean }>()
  const emit = defineEmits<{ detail: [] }>()
</script>

<template>
  <div class="min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-8px">
      <span class="break-words text-14px font-500 text-base-text-1">{{ deliveryMessageTitle(message) }}</span>
      <NButton v-if="canView && message" text type="primary" size="small" @click="emit('detail')">{{
        t("viewMessage")
      }}</NButton>
    </div>
    <div v-if="message" class="mt-6px flex flex-wrap items-center gap-x-10px gap-y-4px text-12px text-base-text-3">
      <span>{{ announcementCategory(message.category) }}</span>
      <NTag size="small" :bordered="false">{{
        $t(`page.notification.manage.announcements.statusOptions.${message.status}` as I18nFullKey)
      }}</NTag>
      <span v-if="message.publishedAt">{{ t("publishedAt") }} {{ deliveryTime(message.publishedAt) }}</span>
      <span v-else>{{ t("createdAt") }} {{ deliveryTime(message.createTime) }}</span>
    </div>
  </div>
</template>

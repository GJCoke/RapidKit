<script setup lang="ts">
  import { onMounted } from "vue"
  import MessageItem from "@/components/notification/message-item.vue"
  import { useNotificationStore } from "@/store/modules/notification"
  import { navigateToAction } from "@/utils/notification/action-nav"
  import { isNotificationActionable } from "@/utils/notification/state"
  import { $t } from "@/locales"
  import { useInbox } from "./composables/use-inbox"
  import MessageFilters from "./modules/message-filters.vue"

  defineOptions({ name: "NotificationCenter" })

  const store = useNotificationStore()
  const { visibleItems, nextCursor, loading, load, applyFilters, readOne, archiveOne, deleteOne } = useInbox()

  onMounted(() => {
    void load(true)
  })

  async function onClick(message: Api.Notification.Message) {
    const read = await readOne(message.id)
    if (!read) return
    await store.refreshUnreadCount()
    if (isNotificationActionable(message) && message.action) await navigateToAction(message.action)
  }

  async function markAllRead() {
    await store.markAllRead()
    await load(true)
  }
</script>

<template>
  <div class="h-full min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard :bordered="false" size="small" class="card-wrapper">
      <template #header>
        <div class="flex-y-center justify-between gap-16px">
          <span>{{ $t("page.notification.title" as I18nFullKey) }}</span>
          <NButton size="small" ghost type="primary" :disabled="!store.hasUnread" @click="markAllRead">
            <template #icon><icon-ic-round-done-all class="text-icon" /></template>
            {{ $t("page.notification.readAll" as I18nFullKey) }}
          </NButton>
        </div>
      </template>
      <MessageFilters @change="applyFilters" />
    </NCard>

    <NCard
      :title="$t('page.notification.listTitle' as I18nFullKey)"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <NScrollbar class="h-full">
        <NEmpty
          v-if="!visibleItems.length && !loading"
          class="mt-80px"
          :description="$t('page.notification.empty' as I18nFullKey)"
        />
        <MessageItem
          v-for="message in visibleItems"
          :key="message.id"
          :message="message"
          @click="onClick"
          @archive="archiveOne"
          @delete="deleteOne"
        />
        <div class="flex-center py-16px">
          <NButton v-if="nextCursor" :loading="loading" @click="load()">
            {{ $t("page.notification.loadMore" as I18nFullKey) }}
          </NButton>
          <span v-else-if="visibleItems.length" class="text-12px text-base-text-3">
            {{ $t("page.notification.noMore" as I18nFullKey) }}
          </span>
        </div>
      </NScrollbar>
    </NCard>
  </div>
</template>

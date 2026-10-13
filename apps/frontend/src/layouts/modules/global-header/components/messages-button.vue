<script setup lang="ts">
  import { computed, onMounted } from "vue"
  import MessagePopover from "@/components/notification/message-popover.vue"
  import { useNotificationStore } from "@/store/modules/notification"
  import { $t } from "@/locales"

  defineOptions({ name: "MessagesButton" })

  const store = useNotificationStore()
  const title = computed(() => $t("page.notification.title" as I18nFullKey))

  onMounted(() => {
    void store.refreshUnreadCount()
  })
</script>

<template>
  <div class="h-full flex-y-center shrink-0">
    <MessagePopover>
      <template #trigger="{ visible }">
        <ButtonIcon
          :tooltip-content="visible ? '' : title"
          :aria-label="title"
          aria-haspopup="dialog"
          :aria-expanded="visible"
          aria-controls="notification-popover"
          class="shrink-0 rounded-8px transition-colors duration-200"
          :class="visible ? 'bg-primary/10 text-primary' : ''"
        >
          <NBadge
            class="message-badge"
            :value="store.badgeText"
            :show="store.hasUnread"
            type="error"
            :max="99"
            :offset="[-2, 0]"
            :theme-overrides="{ fontSize: '10px' }"
          >
            <template #value>
              <span class="block leading-14px">{{ store.badgeText }}</span>
            </template>
            <span class="h-18px w-18px flex-center">
              <SvgIcon :icon="store.hasUnread ? 'line-md:bell-loop' : 'line-md:bell'" class="text-18px" />
            </span>
          </NBadge>
        </ButtonIcon>
      </template>
    </MessagePopover>
  </div>
</template>

<style scoped>
  .message-badge :deep(.n-badge-sup) {
    box-sizing: border-box;
    justify-content: center;
    align-items: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    line-height: 14px;
    bottom: calc(100% - 7px);
  }
</style>

<script setup lang="ts">
  import { computed, onMounted } from "vue"
  import MessageDrawer from "@/components/notification/message-drawer.vue"
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
  <div class="h-full flex-y-center px-2px">
    <NBadge :value="store.badgeText" :show="store.hasUnread" type="error" :offset="[-3, 4]" :max="99">
      <ButtonIcon
        icon="majesticons:bell-line"
        :tooltip-content="title"
        :aria-label="title"
        class="transition-colors duration-200"
        @click="store.openDrawer()"
      />
    </NBadge>
    <MessageDrawer />
  </div>
</template>

<script setup lang="ts">
  import { computed } from "vue"
  import type { RouteKey } from "@elegant-router/types"
  import { useRouterPush } from "@/hooks/common/router"
  import { useNotificationStore } from "@/store/modules/notification"
  import type { DrawerTab } from "@/store/modules/notification"
  import { navigateToAction } from "@/utils/notification/action-nav"
  import { isNotificationActionable } from "@/utils/notification/state"
  import { $t } from "@/locales"
  import MessageItem from "./message-item.vue"

  defineOptions({ name: "MessageDrawer" })

  const store = useNotificationStore()
  const { routerPushByKey } = useRouterPush(false)

  const visible = computed({
    get: () => store.drawerVisible,
    set: (value: boolean) => (value ? store.openDrawer() : store.closeDrawer()),
  })

  const tabs = computed<Array<{ key: DrawerTab; label: string }>>(() => [
    { key: "all", label: $t("page.notification.tabs.all" as I18nFullKey) },
    { key: "unread", label: $t("page.notification.tabs.unread" as I18nFullKey) },
    { key: "announcement", label: $t("page.notification.tabs.announcement" as I18nFullKey) },
  ])

  const unreadLabel = computed(() => `${store.unreadCount} ${$t("page.notification.tabs.unread" as I18nFullKey)}`)

  async function onItemClick(message: Api.Notification.Message) {
    await store.markRead(message.id)
    if (!isNotificationActionable(message) || !message.action) return

    const navigated = await navigateToAction(message.action)
    if (navigated) store.closeDrawer()
  }

  function goCenter() {
    store.closeDrawer()
    void routerPushByKey("notification_center" as RouteKey)
  }
</script>

<template>
  <NDrawer v-model:show="visible" width="min(420px, 94vw)" placement="right">
    <NDrawerContent
      closable
      :native-scrollbar="false"
      body-content-class="!p-0 flex flex-col min-h-0"
      footer-class="!px-16px !py-12px"
    >
      <template #header>
        <div class="flex-y-center w-full justify-between gap-12px pr-24px">
          <div class="min-w-0 flex-y-center gap-12px">
            <div class="size-36px flex-center shrink-0 rounded-10px bg-primary/10 text-primary">
              <SvgIcon icon="carbon:notification" class="text-19px" />
            </div>
            <div class="min-w-0">
              <div class="text-16px font-600 leading-22px text-base-text-1">
                {{ $t("page.notification.title" as I18nFullKey) }}
              </div>
              <div class="mt-1px text-12px leading-18px text-base-text-3">{{ unreadLabel }}</div>
            </div>
          </div>
          <NButton
            quaternary
            size="small"
            :disabled="!store.hasUnread"
            :aria-label="$t('page.notification.readAll' as I18nFullKey)"
            @click="store.markAllRead()"
          >
            <template #icon><SvgIcon icon="carbon:checkmark-outline" /></template>
            {{ $t("page.notification.readAll" as I18nFullKey) }}
          </NButton>
        </div>
      </template>

      <div class="shrink-0 border-b border-theme-default px-16px pt-4px">
        <NTabs
          :value="store.activeTab"
          type="line"
          size="small"
          @update:value="(value: DrawerTab) => store.setTab(value)"
        >
          <NTab v-for="tab in tabs" :key="tab.key" :name="tab.key">
            <span class="flex-y-center gap-6px">
              {{ tab.label }}
              <NBadge v-if="tab.key === 'unread' && store.hasUnread" :value="store.badgeText" type="info" />
            </span>
          </NTab>
        </NTabs>
      </div>

      <div class="min-h-220px flex-1 overflow-hidden">
        <div v-if="store.loading" class="flex-col-stretch" aria-hidden="true">
          <div v-for="index in 4" :key="index" class="flex gap-12px border-b border-theme-default px-16px py-14px">
            <NSkeleton circle height="32px" width="32px" class="shrink-0" />
            <div class="min-w-0 flex-1 flex-col gap-7px">
              <NSkeleton text width="62%" />
              <NSkeleton text :repeat="2" />
              <NSkeleton text width="35%" />
            </div>
          </div>
        </div>
        <NEmpty
          v-else-if="!store.latest.length"
          class="py-56px"
          :description="$t('page.notification.empty' as I18nFullKey)"
        />
        <NScrollbar v-else class="h-full max-h-[calc(100vh-202px)]">
          <div class="flex-col-stretch">
            <MessageItem
              v-for="message in store.latest"
              :key="message.id"
              :message="message"
              :show-actions="false"
              compact
              @click="onItemClick"
            />
          </div>
        </NScrollbar>
      </div>

      <template #footer>
        <NButton
          block
          type="primary"
          secondary
          :aria-label="$t('page.notification.viewAll' as I18nFullKey)"
          @click="goCenter"
        >
          {{ $t("page.notification.viewAll" as I18nFullKey) }}
          <template #icon><SvgIcon icon="carbon:arrow-right" /></template>
        </NButton>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

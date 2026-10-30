<script setup lang="ts">
  import { computed, nextTick, ref, watch } from "vue"
  import { onKeyStroke, useElementBounding, useNow, useWindowSize } from "@vueuse/core"
  import { formatApiTime } from "@/utils/datetime"
  import type { RouteKey } from "@elegant-router/types"
  import { useRouterPush } from "@/hooks/common/router"
  import { useNotificationStore } from "@/store/modules/notification"
  import { navigateToAction } from "@/utils/notification/action-nav"
  import { groupNotifications } from "@/utils/notification/presentation"
  import { isNotificationActionable } from "@/utils/notification/state"
  import { $t, getLocale } from "@/locales"
  import MessageItem from "./message-item.vue"
  import MessagePopoverHeader from "./message-popover-header.vue"

  defineOptions({ name: "MessagePopover" })

  const store = useNotificationStore()
  const { routerPushByKey } = useRouterPush(false)
  const trigger = ref<HTMLElement>()
  const panel = ref<HTMLElement>()
  const { right: triggerRight } = useElementBounding(trigger)
  const { width: viewportWidth } = useWindowSize()
  const panelWidth = computed(() =>
    Math.min(400, viewportWidth.value - 24, triggerRight.value > 0 ? triggerRight.value - 12 : 400),
  )
  const now = useNow({ interval: 60_000 })
  const visible = computed({
    get: () => store.drawerVisible,
    set: (value: boolean) => (value ? store.openDrawer() : store.closeDrawer()),
  })
  const groups = computed(() => groupNotifications(store.latest, now.value.valueOf()))
  const showSkeleton = ref(false)
  const pendingActionId = ref<string | null>(null)
  const loadingPresentation = computed(() => store.loading || showSkeleton.value)
  let skeletonShownAt = 0

  watch(
    [() => store.loading, visible],
    ([loading, open], _, onCleanup) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      if (!open) {
        showSkeleton.value = false
        skeletonShownAt = 0
      } else if (loading && !showSkeleton.value) {
        timer = setTimeout(() => {
          skeletonShownAt = Date.now()
          showSkeleton.value = true
        }, 180)
      } else if (!loading) {
        const remaining = showSkeleton.value ? Math.max(0, 200 - (Date.now() - skeletonShownAt)) : 0
        const hide = () => {
          showSkeleton.value = false
          skeletonShownAt = 0
        }
        if (remaining) timer = setTimeout(hide, remaining)
        else hide()
      }
      onCleanup(() => clearTimeout(timer))
    },
    { immediate: true },
  )

  function formatGroupDate(date: string) {
    const value = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(value.getTime())) return $t("page.notification.popover.other" as I18nFullKey)
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: "UTC",
      year:
        date.slice(0, 4) === formatApiTime(new Date(now.value).toISOString(), undefined, "YYYY")
          ? undefined
          : "numeric",
      month: "short",
      day: "numeric",
    }).format(value)
  }

  watch(visible, async (show) => {
    if (!show) return
    await nextTick()
    panel.value?.focus({ preventScroll: true })
  })

  onKeyStroke("Escape", (event) => {
    if (!visible.value) return
    event.preventDefault()
    store.closeDrawer()
    trigger.value?.querySelector("button")?.focus()
  })

  async function onItemClick(message: Api.Notification.Message) {
    if (loadingPresentation.value) return
    await store.markRead(message.id)
  }

  async function onItemAction(message: Api.Notification.Message) {
    if (
      loadingPresentation.value ||
      pendingActionId.value ||
      store.isRecalled(message) ||
      !isNotificationActionable(message) ||
      !message.action
    )
      return
    const sessionEpoch = store.sessionEpoch
    pendingActionId.value = message.id
    try {
      await store.markRead(message.id)
      if (
        sessionEpoch !== store.sessionEpoch ||
        loadingPresentation.value ||
        store.isRecalled(message) ||
        !isNotificationActionable(message)
      )
        return
      const navigated = await navigateToAction(message.action)
      if (navigated) store.closeDrawer()
      else window.$message?.warning($t("page.notification.actionUnavailable" as I18nFullKey))
    } finally {
      pendingActionId.value = null
    }
  }

  function goCenter() {
    store.closeDrawer()
    void routerPushByKey("notification_center" as RouteKey)
  }
</script>

<template>
  <NPopover
    v-model:show="visible"
    class="notification-panel-anchor"
    raw
    trigger="click"
    placement="bottom-end"
    :theme-overrides="{ space: '10px' }"
    :style="{ boxShadow: 'none' }"
    :show-arrow="false"
    :overlap="false"
  >
    <template #trigger>
      <div ref="trigger" class="h-36px flex-center shrink-0">
        <slot name="trigger" :visible="visible" />
      </div>
    </template>

    <section
      id="notification-popover"
      ref="panel"
      role="dialog"
      tabindex="-1"
      :style="{ width: `${panelWidth}px` }"
      :aria-label="$t('page.notification.popover.title' as I18nFullKey)"
      class="notification-popover flex-col-stretch overflow-hidden outline-none"
    >
      <MessagePopoverHeader
        :active-tab="store.activeTab"
        :badge-text="store.badgeText"
        :has-unread="store.hasUnread"
        @change="(tab) => store.setTab(tab)"
        @read-all="store.markAllRead()"
      />

      <div class="notification-list min-h-0 overflow-hidden" :aria-busy="loadingPresentation">
        <div v-if="showSkeleton" class="notification-loading h-full overflow-hidden" aria-hidden="true">
          <div v-for="(rowCount, groupIndex) in [2, 1]" :key="groupIndex" class="px-12px pb-8px">
            <div class="h-32px flex-y-center gap-12px px-8px">
              <NSkeleton height="12px" width="56px" />
              <span class="h-1px flex-1 bg-theme-fill"></span>
            </div>
            <div v-for="index in rowCount" :key="index" class="mb-8px flex gap-12px rounded-10px bg-primary/5 p-10px">
              <NSkeleton height="32px" width="32px" :sharp="false" class="mt-1px shrink-0 rounded-10px" />
              <div class="min-w-0 flex-1">
                <div class="h-20px flex-y-center"><NSkeleton height="14px" :width="index === 1 ? '66%' : '48%'" /></div>
                <div
                  class="mt-4px flex-col justify-center gap-6px"
                  :class="groupIndex === 0 && index === 1 ? 'h-40px' : 'h-20px'"
                >
                  <NSkeleton height="13px" width="94%" />
                  <NSkeleton v-if="groupIndex === 0 && index === 1" height="13px" width="72%" />
                </div>
                <div class="mt-8px min-h-26px flex flex-wrap items-center gap-8px">
                  <NSkeleton height="10px" width="54px" /><NSkeleton height="10px" width="32px" />
                  <NSkeleton
                    v-if="groupIndex === 0"
                    height="26px"
                    width="110px"
                    :sharp="false"
                    class="ml-auto rounded-6px"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <NEmpty
          v-else-if="!store.latest.length && !store.loading"
          class="h-full flex-col-center"
          :description="$t('page.notification.empty' as I18nFullKey)"
        />
        <div v-else-if="store.latest.length" class="h-full" :inert="loadingPresentation ? true : undefined">
          <NScrollbar class="h-full">
            <div v-for="group in groups" :key="group.date">
              <div
                class="flex-y-center gap-12px px-20px pb-4px pt-10px text-12px leading-18px text-base-text-3 dark:text-base-text-2"
              >
                <span class="shrink-0">
                  {{
                    group.period === "date"
                      ? formatGroupDate(group.date)
                      : $t(`page.notification.popover.${group.period}` as I18nFullKey)
                  }}
                </span>
                <span class="h-1px flex-1 bg-theme-fill" aria-hidden="true"></span>
              </div>
              <div class="flex-col-stretch gap-8px px-12px pb-8px">
                <MessageItem
                  v-for="message in group.items"
                  :key="message.id"
                  :message="message"
                  :show-actions="false"
                  :now="now.valueOf()"
                  :action-loading="pendingActionId === message.id"
                  compact
                  @click="onItemClick"
                  @action="onItemAction"
                />
              </div>
            </div>
          </NScrollbar>
        </div>
      </div>

      <footer class="shrink-0 flex-center border-t border-theme-default px-20px py-10px">
        <NButton
          text
          type="primary"
          icon-placement="right"
          :theme-overrides="{
            textColorTextPrimary: 'var(--notification-accent)',
            textColorTextHoverPrimary: 'var(--notification-accent-hover)',
            textColorTextFocusPrimary: 'var(--notification-accent-hover)',
            textColorTextPressedPrimary: 'var(--notification-accent)',
          }"
          @click="goCenter"
        >
          {{ $t("page.notification.popover.viewAll" as I18nFullKey) }}
          <template #icon><SvgIcon icon="carbon:arrow-right" /></template>
        </NButton>
      </footer>
    </section>
  </NPopover>
</template>

<style scoped>
  .notification-popover {
    --notification-accent: rgb(var(--primary-color));
    --notification-accent-hover: rgb(var(--primary-400-color));
    --border-color: var(--n-divider-color);
    --notification-list-height: min(500px, max(0px, calc(100dvh - 260px)));
    max-height: calc(100dvh - 84px);
    border-radius: 16px;
    background: var(--n-color);
    box-shadow: var(--n-box-shadow);
  }

  .notification-list {
    height: var(--notification-list-height);
    flex: 0 1 var(--notification-list-height);
  }

  .notification-list :deep(.n-scrollbar-container) {
    /* Card disclosure restores the saved position instead of browser scroll anchoring. */
    overflow-anchor: none;
  }

  :global(.dark .notification-popover) {
    --notification-accent: rgb(var(--primary-300-color));
    --notification-accent-hover: rgb(var(--primary-200-color));
  }

  /* Animate the whole surface without scaling its text or rounded corners. */
  :global(.n-popover.notification-panel-anchor.popover-transition-enter-from),
  :global(.n-popover.notification-panel-anchor.popover-transition-leave-to) {
    opacity: 0;
    transform: translateY(-6px);
  }

  :global(.n-popover.notification-panel-anchor.popover-transition-enter-to),
  :global(.n-popover.notification-panel-anchor.popover-transition-leave-from) {
    opacity: 1;
    transform: translateY(0);
  }

  :global(.n-popover.notification-panel-anchor.popover-transition-enter-active) {
    transition:
      opacity 160ms ease-out,
      transform 160ms ease-out;
  }

  :global(.n-popover.notification-panel-anchor.popover-transition-leave-active) {
    transition:
      opacity 120ms ease-in,
      transform 120ms ease-in;
  }

  @media (prefers-reduced-motion: reduce) {
    .notification-loading :deep(.n-skeleton) {
      animation: none;
    }
    :global(.n-popover.notification-panel-anchor.popover-transition-enter-active),
    :global(.n-popover.notification-panel-anchor.popover-transition-leave-active) {
      transition: none;
    }
  }
</style>

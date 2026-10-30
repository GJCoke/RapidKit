<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue"
  import { useResizeObserver } from "@vueuse/core"
  import { formatApiTime, parseApiTime } from "@/utils/datetime"
  import { $t, getLocale } from "@/locales"
  import { formatNotificationTime } from "@/utils/notification/presentation"
  import { renderContent, renderTitle } from "@/utils/notification/content-render"
  import { resolveActionLabel } from "@/utils/notification/action-label"
  import { isNotificationActionable } from "@/utils/notification/state"
  import NotificationTitlePopover from "./notification-title-popover.vue"

  defineOptions({ name: "MessageItem" })

  interface Props {
    message: Api.Notification.Message
    showActions?: boolean
    compact?: boolean
    now?: number
    actionLoading?: boolean
  }

  const props = withDefaults(defineProps<Props>(), { showActions: true, compact: false })
  const expanded = ref(false)
  const hasOverflow = ref(false)
  const previewTitle = ref<HTMLElement>()
  const previewBody = ref<HTMLElement>()
  const expandedTitle = ref<HTMLElement>()
  const hasTitleOverflow = ref(false)
  const readingRegion = ref<HTMLElement>()
  const previewCard = ref<HTMLElement>()
  const animating = ref(false)
  let disclosureAnimation: Animation | undefined
  let originalListScrollTop = 0
  const readingId = `notification-reading-${useId()}`
  const emit = defineEmits<{
    click: [message: Api.Notification.Message]
    action: [message: Api.Notification.Message]
    archive: [id: string]
    delete: [id: string]
  }>()

  const isRecalled = computed(() => props.message.status === "recalled")
  const title = computed(() => (isRecalled.value ? $t("page.notification.recalled") : renderTitle(props.message)))
  const body = computed(() => (isRecalled.value ? "" : renderContent(props.message)))
  const stateText = computed(() => {
    if (props.message.status === "recalled") return $t("page.notification.recalled" as I18nFullKey)
    if (props.message.status === "expired")
      return $t("page.notification.manage.announcements.statusOptions.expired" as I18nFullKey)
    return body.value
  })
  const isUnread = computed(() => !isRecalled.value && !props.message.readAt)
  const isActionable = computed(() => isNotificationActionable(props.message, props.now))
  const actionLabel = computed(
    () =>
      resolveActionLabel(props.message.action, getLocale()).text ||
      $t("page.notification.popover.openAction" as I18nFullKey),
  )
  const levelType = computed(() => {
    const types = { info: "info", success: "success", warning: "warning", error: "error" } as const
    return types[props.message.level]
  })
  const levelLabel = computed(() => $t(`page.notification.level.${props.message.level}` as I18nFullKey))
  const levelIcon = computed(() => {
    const icons = {
      info: "carbon:information",
      success: "carbon:checkmark-outline",
      warning: "carbon:warning-alt",
      error: "carbon:error",
    } as const
    return icons[props.message.level]
  })
  const levelClass = computed(() => {
    const classes = {
      info: "bg-info/10 text-info dark:text-info-300",
      success: "bg-success/10 text-success dark:text-success-300",
      warning: "bg-warning/10 text-warning dark:text-warning-300",
      error: "bg-error/10 text-error dark:text-error-300",
    } as const
    return classes[props.message.level]
  })
  const createdAt = computed(() => formatApiTime(props.message.createTime))
  const compactTime = computed(() => {
    const created = parseApiTime(props.message.createTime)
    const now = props.now ?? Date.now()
    return created.isValid() && now - created.valueOf() >= 86_400_000
      ? formatApiTime(props.message.createTime, undefined, "HH:mm")
      : formatNotificationTime(props.message.createTime, getLocale(), now)
  })
  const categoryLabel = computed(() => {
    const categories: Record<string, string> = {
      "admin.announcement": "adminAnnouncement",
      "system.security": "systemSecurity",
      "user.invited": "userInvited",
      "user.mention": "userMention",
      "task.completed": "taskCompleted",
    }
    const key = categories[props.message.category]
    return key ? $t(`notification.category.${key}` as I18nFullKey) : props.message.category
  })

  function selectMessage() {
    emit("click", props.message)
  }

  function measureOverflow() {
    if (!props.compact || expanded.value) return
    hasOverflow.value = [previewTitle.value, previewBody.value].some(
      (element) => element && element.scrollHeight > element.clientHeight + 1,
    )
  }

  function measureTitleOverflow() {
    if (!expanded.value || !expandedTitle.value) return
    hasTitleOverflow.value = expandedTitle.value.scrollHeight > expandedTitle.value.clientHeight + 1
  }

  useResizeObserver([previewTitle, previewBody], measureOverflow)
  useResizeObserver(expandedTitle, measureTitleOverflow)
  onMounted(measureOverflow)
  onBeforeUnmount(() => disclosureAnimation?.cancel())
  watch([() => props.message.id, isRecalled, title, stateText], async () => {
    disclosureAnimation?.cancel()
    expanded.value = false
    hasTitleOverflow.value = false
    await nextTick()
    measureOverflow()
  })

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  }

  function centerCard(card: HTMLElement, scrollport?: HTMLElement | null) {
    if (!scrollport?.clientHeight) return
    const rect = card.getBoundingClientRect()
    if (!rect.height) return
    const cardTop = rect.top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
    const centeredTop = cardTop - (scrollport.clientHeight - rect.height) / 2
    const top = Math.max(0, Math.min(centeredTop, scrollport.scrollHeight - scrollport.clientHeight))
    scrollport.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" })
  }

  async function animateCard(card: HTMLElement, from: number, to: number) {
    animating.value = true
    const animation = card.animate(
      [
        { height: `${from}px`, opacity: 0.8 },
        { height: `${to}px`, opacity: 1 },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    )
    disclosureAnimation = animation
    try {
      await animation.finished
    } catch {
      // Unmounting or receiving updated content cancels the active transition.
    } finally {
      if (disclosureAnimation === animation) {
        disclosureAnimation = undefined
        animating.value = false
      }
    }
  }

  async function toggleExpanded() {
    if (animating.value) return
    const card = previewCard.value
    if (!card) return
    const scrollport = card.closest<HTMLElement>(".n-scrollbar-container")
    const initialHeight = card.getBoundingClientRect().height
    const opening = !expanded.value
    if (opening) {
      originalListScrollTop = scrollport?.scrollTop ?? 0
    }
    expanded.value = opening
    await nextTick()
    if (opening && readingRegion.value) readingRegion.value.scrollTop = 0
    if (opening) measureTitleOverflow()
    if (!opening) measureOverflow()
    const finalHeight = card.getBoundingClientRect().height
    if (typeof card.animate === "function" && initialHeight !== finalHeight && !reducedMotion()) {
      await animateCard(card, initialHeight, finalHeight)
    }
    if (!card.isConnected || expanded.value !== opening) return
    if (opening) centerCard(card, scrollport)
    else if (scrollport) {
      scrollport.scrollTo({ top: originalListScrollTop, behavior: reducedMotion() ? "auto" : "smooth" })
    }
  }
</script>

<template>
  <div
    v-if="isRecalled"
    class="notification-recalled text-base-text-3"
    :class="
      compact
        ? 'notification-preview notification-preview-read rounded-10px bg-base-text/3 px-16px py-10px dark:bg-base-text/5'
        : 'border-b border-theme-default px-16px py-13px'
    "
  >
    <div class="flex items-start gap-12px">
      <span class="mt-1px size-32px flex-center shrink-0 rounded-10px bg-base-text/6 dark:bg-base-text/8">
        <SvgIcon icon="carbon:undo" class="text-18px" aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="m-0 h-20px truncate text-14px font-500 leading-20px text-base-text-2">
          {{ $t("page.notification.recalled") }}
        </p>
        <p class="m-0 mt-4px text-13px leading-20px" :class="compact ? 'h-40px' : ''">
          {{ $t("page.notification.recalledContent") }}
        </p>
      </div>
    </div>
    <div
      class="ml-44px mt-8px flex items-center gap-5px text-12px leading-18px"
      :class="compact ? 'h-26px' : 'flex-wrap gap-y-6px'"
    >
      <span class="min-w-0 truncate">{{ categoryLabel }}</span>
      <span class="shrink-0" aria-hidden="true">·</span>
      <time :datetime="message.createTime" :title="createdAt" class="shrink-0 tabular-nums">
        {{ compact ? compactTime : createdAt }}
      </time>
      <div v-if="!compact && showActions" class="ml-auto flex shrink-0 gap-4px">
        <NButton ghost size="tiny" @click="emit('archive', message.id)">
          {{ $t("page.notification.archive") }}
        </NButton>
        <NPopconfirm @positive-click="emit('delete', message.id)">
          <template #trigger>
            <NButton ghost size="tiny" type="error">
              {{ $t("page.notification.delete") }}
            </NButton>
          </template>
          {{ $t("common.confirmDelete") }}
        </NPopconfirm>
      </div>
    </div>
  </div>
  <article
    v-else-if="compact"
    ref="previewCard"
    class="notification-preview relative rounded-10px px-16px py-10px transition-colors duration-200"
    :class="[
      isUnread
        ? 'notification-preview-unread bg-primary/8 hover:bg-primary/12 dark:bg-primary/12 dark:hover:bg-primary/16'
        : 'notification-preview-read bg-container',
      { 'notification-preview-animating': animating },
    ]"
  >
    <span
      v-if="isUnread"
      class="notification-preview-unread-dot absolute right-16px top-17px size-6px rounded-full pointer-events-none"
      aria-hidden="true"
    ></span>
    <button
      v-show="!expanded"
      type="button"
      :aria-label="title"
      class="notification-preview-content w-full flex items-start gap-12px rounded-6px text-left outline-theme-primary"
      @click="selectMessage"
    >
      <span class="mt-1px size-32px flex-center shrink-0 rounded-10px" :class="levelClass">
        <SvgIcon :icon="levelIcon" class="text-18px" :aria-label="levelLabel" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="h-20px flex items-start gap-6px pr-16px">
          <span
            ref="previewTitle"
            class="notification-preview-title notification-preview-clamp h-20px min-w-0 flex-1 text-14px font-600 leading-20px text-base-text-1"
            >{{ title }}</span
          >
          <NTag v-if="message.mandatory" class="shrink-0" type="warning" size="tiny" :bordered="false">
            {{ $t("page.notification.popover.required" as I18nFullKey) }}
          </NTag>
        </span>
        <span
          ref="previewBody"
          class="notification-preview-body notification-preview-clamp mt-4px h-40px whitespace-pre-line text-13px leading-20px text-base-text-2"
        >
          {{ stateText }}
        </span>
      </span>
    </button>
    <div v-show="expanded">
      <div class="notification-preview-expanded-header h-44px flex items-start gap-12px">
        <span class="mt-1px size-32px flex-center shrink-0 rounded-10px" :class="levelClass">
          <SvgIcon :icon="levelIcon" class="text-18px" :aria-label="levelLabel" />
        </span>
        <div class="min-w-0 flex-1">
          <div
            ref="expandedTitle"
            class="notification-preview-expanded-title notification-preview-clamp h-20px pr-16px whitespace-pre-line text-14px font-600 leading-20px text-base-text-1"
          >
            {{ title }}
          </div>
          <div
            class="mt-4px h-20px flex items-center gap-x-5px text-12px leading-20px text-base-text-3 dark:text-base-text-2"
          >
            <NTag v-if="message.mandatory" class="shrink-0" type="warning" size="tiny" :bordered="false">
              {{ $t("page.notification.popover.required" as I18nFullKey) }}
            </NTag>
            <span class="min-w-0 truncate">{{ categoryLabel }}</span>
            <span class="shrink-0" aria-hidden="true">·</span>
            <time :datetime="message.createTime" :title="createdAt" class="shrink-0 tabular-nums">{{
              compactTime
            }}</time>
            <span v-if="expanded && hasTitleOverflow" class="ml-auto shrink-0">
              <NotificationTitlePopover :title="title" />
            </span>
          </div>
        </div>
      </div>
      <div
        ref="readingRegion"
        :id="readingId"
        role="region"
        :aria-label="title"
        tabindex="0"
        class="notification-preview-reading mt-12px rounded-8px bg-container p-12px whitespace-pre-line text-13px leading-22px text-base-text-2 outline-theme-primary"
      >
        {{ stateText }}
      </div>
    </div>
    <div
      v-if="!expanded || hasOverflow || isActionable"
      class="notification-preview-footer mt-8px h-26px flex items-center gap-x-12px"
      :class="expanded ? '' : 'ml-44px'"
    >
      <div
        v-show="!expanded"
        class="min-w-0 flex flex-1 items-center gap-x-5px whitespace-nowrap text-12px leading-18px text-base-text-3 dark:text-base-text-2"
      >
        <span class="min-w-0 truncate">{{ categoryLabel }}</span>
        <span class="shrink-0" aria-hidden="true">·</span>
        <time :datetime="message.createTime" :title="createdAt" class="shrink-0 tabular-nums">{{ compactTime }}</time>
      </div>
      <div
        v-if="hasOverflow || isActionable"
        class="notification-preview-actions ml-auto min-w-0 flex items-center justify-end gap-x-8px"
        :class="expanded ? 'max-w-full' : 'max-w-65%'"
      >
        <button
          v-if="hasOverflow"
          type="button"
          class="notification-preview-toggle notification-preview-control min-h-26px shrink-0 inline-flex items-center gap-4px rounded-4px whitespace-nowrap text-12px leading-20px outline-theme-primary"
          :aria-expanded="expanded"
          :disabled="animating"
          :aria-controls="readingId"
          @click="toggleExpanded"
        >
          {{ $t(`page.notification.popover.${expanded ? "collapseContent" : "expandContent"}` as I18nFullKey) }}
          <SvgIcon
            :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="shrink-0 text-14px"
            aria-hidden="true"
          />
        </button>
        <span
          v-if="hasOverflow && isActionable"
          class="h-12px w-1px shrink-0 bg-base-text/15"
          aria-hidden="true"
        ></span>
        <button
          v-if="isActionable"
          type="button"
          class="notification-preview-action notification-preview-control min-h-26px min-w-0 max-w-full inline-flex items-center gap-4px rounded-4px whitespace-nowrap text-right text-12px leading-20px outline-theme-primary"
          :disabled="actionLoading"
          :aria-busy="actionLoading"
          @click="emit('action', message)"
        >
          <span class="notification-preview-action-label min-w-0">{{ actionLabel }}</span>
          <SvgIcon
            :icon="actionLoading ? 'lucide:loader-circle' : 'lucide:mouse-pointer-click'"
            class="shrink-0 text-14px"
            :class="{ 'animate-spin motion-reduce:animate-none': actionLoading }"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </article>
  <div
    v-else
    role="button"
    tabindex="0"
    :aria-label="title"
    class="group flex flex-col gap-6px border-b border-theme-default px-16px py-13px cursor-pointer outline-none transition-all duration-200 hover:bg-theme-modal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary"
    @click="selectMessage"
    @keydown.enter.prevent="selectMessage"
    @keydown.space.prevent="selectMessage"
  >
    <div class="contents">
      <div class="flex items-start gap-6px">
        <NBadge v-if="isUnread" dot type="error" class="mt-7px" />
        <NTag :type="levelType" size="small" :bordered="false">{{ levelLabel }}</NTag>
        <span
          class="min-w-0 flex-1 leading-20px text-base-text-1"
          :class="[isUnread ? 'font-600' : 'font-500', 'truncate text-14px']"
        >
          {{ title }}
        </span>
        <NTag v-if="message.mandatory" class="shrink-0" type="warning" size="tiny" :bordered="false">
          {{ $t("page.notification.mandatory" as I18nFullKey) }}
        </NTag>
      </div>

      <p class="m-0 mt-3px whitespace-pre-line line-clamp-2 text-13px leading-19px text-base-text-2">
        {{ stateText }}
      </p>

      <div class="min-w-0 mt-6px flex-y-center gap-5px text-12px text-base-text-3">
        <time :datetime="message.createTime" class="tabular-nums">{{ createdAt }}</time>
        <div v-if="showActions" class="ml-auto flex gap-4px" @click.stop @keydown.stop>
          <NButton ghost size="tiny" @click="emit('archive', message.id)">
            {{ $t("page.notification.archive" as I18nFullKey) }}
          </NButton>
          <NPopconfirm @positive-click="emit('delete', message.id)">
            <template #trigger>
              <NButton ghost size="tiny" type="error">
                {{ $t("page.notification.delete" as I18nFullKey) }}
              </NButton>
            </template>
            {{ $t("common.confirmDelete") }}
          </NPopconfirm>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .notification-preview {
    box-sizing: border-box;
    box-shadow: inset 0 0 0 1px rgb(var(--base-text-color) / 0.08);
  }

  .notification-preview-animating {
    overflow: hidden;
  }

  .notification-preview:hover {
    box-shadow: inset 0 0 0 1px rgb(var(--base-text-color) / 0.16);
  }

  .notification-preview-unread {
    box-shadow: inset 0 0 0 1px rgb(var(--primary-color) / 0.2);
  }

  .notification-preview-unread:hover {
    box-shadow: inset 0 0 0 1px rgb(var(--primary-color) / 0.3);
  }

  :global(.dark .notification-preview-unread) {
    box-shadow: inset 0 0 0 1px rgb(var(--primary-300-color) / 0.24);
  }

  :global(.dark .notification-preview-unread:hover) {
    box-shadow: inset 0 0 0 1px rgb(var(--primary-300-color) / 0.34);
  }

  .notification-preview-read .notification-preview-reading {
    background: rgb(var(--base-text-color) / 0.025);
  }

  .notification-preview-clamp {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .notification-preview-title,
  .notification-preview-expanded-title {
    -webkit-line-clamp: 1;
  }

  .notification-preview-reading {
    box-sizing: border-box;
    height: min(240px, max(100px, calc(100dvh - 400px)));
    overflow-y: auto;
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
    scrollbar-width: thin;
    scrollbar-color: rgb(var(--base-text-color) / 0.2) transparent;
    border: 1px solid rgb(var(--base-text-color) / 0.08);
  }

  .notification-preview-control {
    appearance: none;
    border: 0;
    padding: 0 2px;
    background: transparent;
    color: var(--notification-accent);
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
    transition:
      color 160ms ease,
      opacity 160ms ease;
  }

  .notification-preview-control:hover:not(:disabled) {
    color: var(--notification-accent-hover);
    text-decoration: none;
  }

  .notification-preview-control:active:not(:disabled) {
    opacity: 0.75;
    text-decoration: none;
  }

  .notification-preview-control:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .notification-preview-control:focus-visible,
  .notification-preview-reading:focus-visible {
    outline: 2px solid var(--notification-accent);
    outline-offset: 2px;
  }

  .notification-preview-unread-dot {
    background: var(--notification-accent);
  }

  .notification-preview-content {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }

  .notification-preview-content:focus-visible {
    outline: 2px solid var(--notification-accent);
    outline-offset: 4px;
  }

  .notification-preview-action-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

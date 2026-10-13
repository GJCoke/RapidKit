<script setup lang="ts">
  import { nextTick, ref, useId, watch } from "vue"
  import { $t } from "@/locales"

  defineOptions({ name: "NotificationTitlePopover" })
  defineProps<{ title: string }>()
  const visible = ref(false)
  const trigger = ref<HTMLButtonElement>()
  const panel = ref<HTMLElement>()
  const panelId = `notification-full-title-${useId()}`

  watch(visible, async (show) => {
    if (show) {
      await nextTick()
      panel.value?.focus({ preventScroll: true })
    }
  })

  function close() {
    visible.value = false
    trigger.value?.focus({ preventScroll: true })
  }
</script>

<template>
  <NPopover
    v-model:show="visible"
    trigger="click"
    placement="bottom-end"
    :style="{ width: 'min(300px, calc(100vw - 48px))', boxSizing: 'border-box' }"
  >
    <template #trigger>
      <button
        ref="trigger"
        type="button"
        class="notification-title-trigger h-20px shrink-0 inline-flex items-center gap-4px rounded-4px text-12px leading-20px outline-theme-primary"
        aria-haspopup="dialog"
        :aria-expanded="visible"
        :aria-controls="panelId"
      >
        {{ $t("page.notification.popover.completeTitle" as I18nFullKey) }}
        <SvgIcon icon="lucide:eye" class="shrink-0 text-14px" aria-hidden="true" />
      </button>
    </template>
    <section
      ref="panel"
      :id="panelId"
      role="dialog"
      :aria-label="$t('page.notification.popover.completeTitle' as I18nFullKey)"
      tabindex="-1"
      class="notification-title-panel outline-none"
      @keydown.esc.stop.prevent="close"
    >
      <header class="mb-8px flex items-center justify-between gap-12px">
        <span class="text-13px font-600 leading-20px text-base-text-1">
          {{ $t("page.notification.popover.completeTitle" as I18nFullKey) }}
        </span>
        <button
          type="button"
          :aria-label="$t('common.close')"
          class="notification-title-close size-24px flex-center shrink-0 rounded-4px text-base-text-3 hover:bg-base-text/8 outline-theme-primary"
          @click="close"
        >
          <SvgIcon icon="carbon:close" class="text-16px" />
        </button>
      </header>
      <div
        role="region"
        :aria-label="$t('page.notification.popover.completeTitle' as I18nFullKey)"
        tabindex="0"
        class="notification-title-full max-h-180px overflow-y-auto whitespace-pre-line text-13px leading-22px text-base-text-2 outline-theme-primary"
      >
        {{ title }}
      </div>
    </section>
  </NPopover>
</template>

<style scoped>
  .notification-title-trigger,
  .notification-title-close {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
    transition:
      color 160ms ease,
      opacity 160ms ease;
  }

  .notification-title-trigger {
    color: var(--notification-accent, rgb(var(--primary-color)));
  }

  :global(.dark .notification-title-trigger) {
    color: var(--notification-accent, rgb(var(--primary-300-color)));
  }

  .notification-title-trigger:hover {
    color: var(--notification-accent-hover, rgb(var(--primary-400-color)));
    text-decoration: none;
  }

  :global(.dark .notification-title-trigger:hover) {
    color: var(--notification-accent-hover, rgb(var(--primary-200-color)));
  }

  .notification-title-trigger:active,
  .notification-title-close:active {
    opacity: 0.75;
    text-decoration: none;
  }

  .notification-title-trigger:focus-visible,
  .notification-title-close:focus-visible,
  .notification-title-full:focus-visible {
    outline: 2px solid rgb(var(--primary-color));
    outline-offset: 2px;
  }

  .notification-title-full {
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
    scrollbar-width: thin;
    scrollbar-color: rgb(var(--base-text-color) / 0.2) transparent;
  }
</style>

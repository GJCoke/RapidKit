<script setup lang="ts">
  import type { DrawerTab } from "@/store/modules/notification"
  import { $t } from "@/locales"

  defineOptions({ name: "MessagePopoverHeader" })
  defineProps<{ activeTab: DrawerTab; badgeText: string; hasUnread: boolean }>()
  const emit = defineEmits<{ change: [tab: DrawerTab]; readAll: [] }>()
  const tabs: DrawerTab[] = ["all", "unread", "announcement"]
</script>

<template>
  <div class="shrink-0">
    <header class="flex-y-center justify-between gap-8px bg-primary/5 px-20px py-14px">
      <div class="min-w-0 flex-y-center flex-wrap gap-8px">
        <h2 class="m-0 text-18px font-600 leading-26px text-base-text-1">
          {{ $t("page.notification.popover.title" as I18nFullKey) }}
        </h2>
        <span
          class="rounded-full bg-primary/10 px-8px py-2px text-12px leading-18px text-primary dark:text-primary-300"
          aria-live="polite"
        >
          {{ $t("page.notification.popover.unreadCount" as I18nFullKey, { count: badgeText }) }}
        </span>
      </div>
      <NButton
        class="shrink-0"
        text
        type="primary"
        size="small"
        :theme-overrides="{
          textColorTextPrimary: 'var(--notification-accent)',
          textColorTextHoverPrimary: 'var(--notification-accent-hover)',
          textColorTextFocusPrimary: 'var(--notification-accent-hover)',
          textColorTextPressedPrimary: 'var(--notification-accent)',
        }"
        :disabled="!hasUnread"
        @click="emit('readAll')"
      >
        <template #icon><SvgIcon icon="carbon:checkmark" /></template>
        {{ $t("page.notification.readAll" as I18nFullKey) }}
      </NButton>
    </header>

    <div class="px-20px pb-4px pt-10px">
      <NTabs
        :value="activeTab"
        type="segment"
        size="small"
        :theme-overrides="{
          tabTextColorActiveSegment: 'var(--notification-accent)',
          tabTextColorHoverSegment: 'var(--notification-accent-hover)',
        }"
        @update:value="(tab: DrawerTab) => emit('change', tab)"
      >
        <NTab v-for="tab in tabs" :key="tab" :name="tab">
          <span class="flex-y-center gap-5px">
            {{ $t(`page.notification.tabs.${tab}` as I18nFullKey) }}
            <span
              v-if="tab === 'unread' && hasUnread"
              class="text-12px tabular-nums text-primary dark:text-primary-300"
              >{{ badgeText }}</span
            >
          </span>
        </NTab>
      </NTabs>
    </div>
  </div>
</template>

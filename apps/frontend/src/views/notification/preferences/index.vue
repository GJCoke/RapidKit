<script setup lang="ts">
  import { onMounted } from "vue"
  import { $t } from "@/locales"
  import { useNotificationPreferences } from "./use-notification-preferences"

  defineOptions({ name: "NotificationPreferences" })

  const { items, loading, load, toggle, isSaving } = useNotificationPreferences()

  onMounted(() => {
    void load()
  })
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <NCard
      :title="$t('page.notification.preferences.title' as I18nFullKey)"
      :bordered="false"
      size="small"
      class="card-wrapper sm:flex-1-hidden"
    >
      <NSpin :show="loading">
        <NEmpty
          v-if="!loading && !items.length"
          class="mt-56px"
          :description="$t('page.notification.empty' as I18nFullKey)"
        />
        <div v-else class="flex-col-stretch gap-12px">
          <div
            v-for="item in items"
            :key="item.category"
            class="flex-y-center justify-between gap-16px rd-8px border border-theme-default px-16px py-14px transition-colors duration-200 hover:bg-theme-modal"
          >
            <div class="min-w-0 flex-col gap-4px">
              <span class="ellipsis-text text-14px font-600 text-base-text-1">{{
                $t(item.nameKey as I18nFullKey)
              }}</span>
              <span class="text-12px text-base-text-3">{{
                !item.closable || item.reserved
                  ? $t("page.notification.preferences.mandatoryHint" as I18nFullKey)
                  : $t("page.notification.preferences.optionalHint" as I18nFullKey)
              }}</span>
            </div>
            <NSwitch
              :value="item.enabled"
              :loading="isSaving(item.category)"
              :disabled="!item.closable || item.reserved"
              :aria-label="$t(item.nameKey as I18nFullKey)"
              @update:value="(enabled: boolean) => toggle(item, enabled)"
            />
          </div>
        </div>
      </NSpin>
    </NCard>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useBannerStore } from "@/store/modules/banner"
  import { renderTitle, renderContent } from "@/utils/notification/content-render"
  import { navigateToAction } from "@/utils/notification/action-nav"
  import { resolveActionLabel } from "@/utils/notification/action-label"
  import { $t, getLocale } from "@/locales"
  defineOptions({ name: "GlobalAnnouncement" })
  const store = useBannerStore()
  const details = ref(false)
  const t = (key: string) => $t(`page.notification.banner.${key}` as I18nFullKey)
  const item = computed(() => store.current)
  const title = computed(() => (item.value ? renderTitle(item.value) : ""))
  const content = computed(() => (item.value ? renderContent(item.value) : ""))
  const actionLabel = computed(() => resolveActionLabel(item.value?.action, getLocale()).text || t("openAction"))
  const levelColor = computed(() => `rgb(var(--${item.value?.level ?? "info"}-color))`)
  const colors = {
    info: "bg-info/10 border-info/30 text-info",
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    error: "bg-error/10 border-error/30 text-error",
  }
  watch(
    () => item.value?.id,
    () => {
      details.value = false
    },
  )
  async function openAction() {
    if (!item.value?.action) return
    if (await navigateToAction(item.value.action)) details.value = false
    else window.$message?.warning($t("page.notification.actionUnavailable" as I18nFullKey))
  }
</script>
<template>
  <section
    v-if="item"
    role="region"
    :aria-label="t('topBanner')"
    class="min-h-44px grid grid-cols-[96px_minmax(0,1fr)_96px] items-center gap-10px border-b px-16px py-10px"
    :class="colors[item.level]"
  >
    <div class="col-start-2 min-w-0 flex items-center justify-center gap-8px">
      <SvgIcon icon="carbon:bullhorn" class="shrink-0 text-16px" aria-hidden="true" />
      <div class="min-w-0 text-center sm:flex sm:items-center sm:justify-center sm:gap-20px">
        <p
          class="m-0 line-clamp-2 break-words text-13px font-600 sm:max-w-1/2 sm:shrink-0 sm:line-clamp-none sm:truncate"
        >
          {{ title }}
        </p>
        <p class="m-0 hidden min-w-0 truncate text-13px text-base-text-2 sm:block">{{ content }}</p>
      </div>
    </div>
    <NButton text :type="item.level" size="small" class="justify-self-end" @click="details = true">
      {{ t("viewDetails") }}
      <SvgIcon icon="carbon:chevron-right" class="ml-4px text-14px" aria-hidden="true" />
    </NButton>
  </section>
  <NModal
    v-model:show="details"
    preset="card"
    :title="t('detailTitle')"
    class="w-640px max-w-[calc(100vw-32px)]"
    :style="{ borderTop: `3px solid ${levelColor}` }"
    :bordered="false"
  >
    <div v-if="item" class="max-h-65vh overflow-auto">
      <h2 class="mb-16px mt-0 break-words text-18px">{{ title }}</h2>
      <p class="m-0 whitespace-pre-wrap break-words text-14px leading-24px">{{ content }}</p>
      <div v-if="item.action" class="mt-20px flex justify-end border-t border-theme-default pt-16px">
        <NButton type="primary" @click="openAction">{{ actionLabel }}</NButton>
      </div>
    </div>
  </NModal>
</template>

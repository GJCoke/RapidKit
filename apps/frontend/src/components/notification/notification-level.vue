<script setup lang="ts">
  import { computed } from "vue"
  import { $t } from "@/locales"
  const props = defineProps<{ level: Api.Notification.Level }>()
  const icons = {
    info: "carbon:information-filled",
    success: "carbon:checkmark-filled",
    warning: "carbon:warning-filled",
    error: "carbon:error-filled",
  }
  const icon = computed(() => icons[props.level] ?? icons.info)
</script>
<template>
  <NTag :type="level" size="small" :bordered="false" class="shrink-0">
    <span class="inline-flex items-center gap-4px"
      ><SvgIcon :icon="icon" aria-hidden="true" />{{ $t(`page.notification.level.${level}` as I18nFullKey) }}</span
    >
  </NTag>
</template>

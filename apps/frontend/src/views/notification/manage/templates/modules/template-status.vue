<script setup lang="ts">
  import { templateListText as t } from "./template-presentation"

  defineOptions({ name: "TemplateStatus" })
  defineProps<{ enabled: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-8px whitespace-nowrap text-13px">
    <NBadge dot :type="enabled ? 'success' : 'default'" aria-hidden="true" />
    <span :class="enabled ? 'text-base-text-1' : 'text-base-text-3'">{{ t(enabled ? "enabled" : "disabled") }}</span>
  </span>
</template>

<script setup lang="ts">
  import { $t } from "@/locales"
  import type { SchedulePreview } from "./schedule"
  defineOptions({ name: "SchedulePreviewPanel" })
  const props = defineProps<{
    preview: SchedulePreview | null
    loading: boolean
    failed: boolean
    invalid: boolean
    hint?: string
    precise?: boolean
  }>()
  defineEmits<{ refresh: [] }>()
  function displayTime(value: string, precise = false) {
    const local = value.replace("T", " ").replace(/(?:[+-]\d{2}:\d{2}|Z)$/, "")
    return precise ? local : local.replace(/\.\d+$/, "")
  }
</script>

<template>
  <div class="flex-col-stretch gap-8px min-w-0" :aria-busy="loading">
    <div class="flex-y-center justify-between gap-8px">
      <div class="flex-y-center flex-wrap gap-6px min-w-0">
        <span class="font-600 text-13px">{{ $t("common.crontabEditor.nextRuns") }}</span>
        <NTag v-if="preview" size="small" :bordered="false"
          ><span class="text-11px">{{ preview.timezone }}</span></NTag
        >
      </div>
      <NButton
        size="small"
        type="primary"
        secondary
        :loading="loading"
        :disabled="loading || invalid"
        :aria-label="$t('common.crontabEditor.refresh')"
        class="shrink-0"
        @click="$emit('refresh')"
      >
        <template #icon><SvgIcon icon="carbon:renew" /></template>
        {{ $t("common.crontabEditor.refresh") }}
      </NButton>
    </div>
    <p v-if="hint" class="text-12px text-base-text-3 leading-relaxed">{{ hint }}</p>
    <NAlert v-if="failed" type="warning">{{ $t("common.crontabEditor.previewFailed") }}</NAlert>
    <p v-else-if="invalid" class="text-12px text-base-text-3">{{ $t("common.crontabEditor.fixBeforePreview") }}</p>
    <ol
      v-else-if="loading || !preview"
      class="schedule-runs rd-8px border border-theme-default overflow-hidden"
      aria-hidden="true"
    >
      <li
        v-for="index in 5"
        :key="index"
        class="schedule-run flex-y-center gap-10px min-h-40px px-12px py-9px text-13px leading-20px"
      >
        <NSkeleton width="12px" height="12px" class="shrink-0" />
        <span class="relative block min-w-0 font-mono tabular-nums break-all">
          <span class="invisible">{{ props.precise ? "2000-01-01 00:00:00.000000" : "2000-01-01 00:00:00" }}</span>
          <NSkeleton width="100%" height="100%" class="absolute-lt" />
        </span>
      </li>
    </ol>
    <template v-else>
      <ol v-if="preview.nextRuns.length" class="schedule-runs rd-8px border border-theme-default overflow-hidden">
        <li
          v-for="(run, index) in preview.nextRuns"
          :key="run"
          class="schedule-run flex-y-center gap-10px min-h-40px px-12px py-9px text-13px leading-20px"
        >
          <span class="text-base-text-3 text-11px shrink-0 tabular-nums w-12px">{{ index + 1 }}</span>
          <time class="block min-w-0 font-mono tabular-nums break-all" :datetime="run" :title="run">{{
            displayTime(run, precise)
          }}</time>
        </li>
      </ol>
      <p v-if="preview.nextRuns.length < 5" class="text-12px text-warning leading-relaxed">
        {{ $t("common.crontabEditor.horizon", { years: preview.horizonYears }) }}
      </p>
      <p class="text-11px text-base-text-3 break-all">
        {{
          $t("common.crontabEditor.evaluatedAt", {
            time: displayTime(preview.evaluatedAt, precise),
            timezone: preview.timezone,
          })
        }}
      </p>
      <NAlert v-if="!preview.valid" type="error">{{ $t("common.scheduleEditor.invalid") }}</NAlert>
    </template>
  </div>
</template>

<style scoped>
  .schedule-run + .schedule-run {
    border-top: 1px solid var(--border-color);
  }
</style>

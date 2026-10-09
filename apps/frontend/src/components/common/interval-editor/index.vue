<script setup lang="ts">
  import { computed, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import PreviewPanel from "../schedule-editor/preview-panel.vue"
  import { intervalPeriods, validInterval } from "../schedule-editor/schedule"
  import type { IntervalValue, PreviewLoader } from "../schedule-editor/schedule"
  import { useSchedulePreview } from "../schedule-editor/use-schedule-preview"
  defineOptions({ name: "IntervalEditor" })
  const props = withDefaults(defineProps<{ disabled?: boolean; loadPreview: PreviewLoader<IntervalValue> }>(), {
    disabled: false,
  })
  const emit = defineEmits<{ "validity-change": [valid: boolean] }>()
  const model = defineModel<IntervalValue>({ required: true })
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
  }))
  const valid = computed(() => validInterval(model.value))
  const options = computed(() =>
    intervalPeriods.map((value) => ({ value, label: $t(`common.scheduleEditor.periods.${value}`) })),
  )
  const presets: IntervalValue[] = [
    { every: 30, period: "seconds" },
    { every: 5, period: "minutes" },
    { every: 15, period: "minutes" },
    { every: 1, period: "hours" },
  ]
  const { preview, previewFailed, loading, refresh, validate } = useSchedulePreview(
    model,
    () => props.loadPreview,
    () => valid.value,
  )
  watch(
    [valid, preview, loading, previewFailed],
    () =>
      emit("validity-change", Boolean(valid.value && preview.value?.valid && !loading.value && !previewFailed.value)),
    { immediate: true },
  )
  defineExpose({ validate, refresh })
</script>

<template>
  <section
    class="flex-col-stretch gap-16px min-w-0 rd-12px border border-theme-default bg-theme-body p-16px"
    :style="themeStyle"
    :aria-label="$t('common.scheduleEditor.types.interval')"
  >
    <div class="flex-y-center gap-8px font-600 text-15px">
      <SvgIcon icon="carbon:timer" class="text-primary text-18px" />{{ $t("common.scheduleEditor.types.interval") }}
    </div>
    <div class="grid grid-cols-2 gap-12px">
      <div class="flex-col-stretch gap-8px min-w-0">
        <label class="text-13px text-base-text-2">{{ $t("common.scheduleEditor.every") }}</label>
        <NInputNumber
          v-model:value="model.every"
          placeholder="15"
          :min="1"
          :max="2147483647"
          :step="1"
          :disabled="disabled"
          :status="valid ? undefined : 'error'"
          :input-props="{ 'aria-label': $t('common.scheduleEditor.every') }"
          class="w-full"
        />
      </div>
      <div class="flex-col-stretch gap-8px min-w-0">
        <label class="text-13px text-base-text-2">{{ $t("common.scheduleEditor.unit") }}</label>
        <NSelect
          v-model:value="model.period"
          :options="options"
          :disabled="disabled"
          :aria-label="$t('common.scheduleEditor.unit')"
        />
      </div>
    </div>
    <div class="flex-y-center flex-wrap gap-6px" role="group" :aria-label="$t('common.scheduleEditor.presets')">
      <NButton
        v-for="preset in presets"
        :key="`${preset.every}-${preset.period}`"
        size="small"
        secondary
        :disabled="disabled"
        @click="model = { ...preset }"
        >{{ preset.every }} {{ $t(`common.scheduleEditor.periods.${preset.period}`) }}</NButton
      >
    </div>
    <NAlert v-if="!valid" type="error" role="alert">{{ $t("common.scheduleEditor.intervalError") }}</NAlert>
    <NAlert v-else type="info" :show-icon="false" aria-live="polite">{{
      $t("common.scheduleEditor.intervalSummary", {
        count: model.every,
        unit: $t(`common.scheduleEditor.periods.${model.period}`),
      })
    }}</NAlert>
    <PreviewPanel
      :preview="preview"
      :loading="loading"
      :failed="previewFailed"
      :invalid="!valid"
      :precise="model.period === 'microseconds' || model.period === 'milliseconds'"
      :hint="$t('common.scheduleEditor.intervalHint')"
      @refresh="refresh"
    />
  </section>
</template>

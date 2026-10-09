<script setup lang="ts">
  import { computed, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import PreviewPanel from "../schedule-editor/preview-panel.vue"
  import { solarEvents, validSolar } from "../schedule-editor/schedule"
  import type { SolarValue, PreviewLoader } from "../schedule-editor/schedule"
  import { useSchedulePreview } from "../schedule-editor/use-schedule-preview"
  defineOptions({ name: "SolarEditor" })
  const props = withDefaults(defineProps<{ disabled?: boolean; loadPreview: PreviewLoader<SolarValue> }>(), {
    disabled: false,
  })
  const emit = defineEmits<{ "validity-change": [valid: boolean] }>()
  const model = defineModel<SolarValue>({ required: true })
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
  }))
  const valid = computed(() => validSolar(model.value))
  const options = computed(() =>
    solarEvents.map((value) => ({ value, label: $t(`common.scheduleEditor.events.${value}`) })),
  )
  const coordinates = computed(() =>
    valid.value
      ? `${Math.abs(model.value.latitude!)}° ${$t(model.value.latitude! < 0 ? "common.scheduleEditor.south" : "common.scheduleEditor.north")} · ${Math.abs(model.value.longitude!)}° ${$t(model.value.longitude! < 0 ? "common.scheduleEditor.west" : "common.scheduleEditor.east")}`
      : "",
  )
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
    class="solar-editor flex-col-stretch gap-16px min-w-0 rd-12px border border-theme-default bg-theme-body p-16px"
    :style="themeStyle"
    :aria-label="$t('common.scheduleEditor.types.solar')"
  >
    <div class="flex-y-center gap-8px font-600 text-15px">
      <SvgIcon icon="carbon:sun" class="text-primary text-18px" />{{ $t("common.scheduleEditor.types.solar") }}
    </div>
    <div class="flex-col-stretch gap-8px">
      <label class="text-13px text-base-text-2">{{ $t("common.scheduleEditor.event") }}</label>
      <NSelect
        v-model:value="model.event"
        :options="options"
        :disabled="disabled"
        :aria-label="$t('common.scheduleEditor.event')"
      />
      <p class="text-12px text-base-text-3 leading-relaxed">
        {{ $t(`common.scheduleEditor.eventHints.${model.event}`) }}
      </p>
    </div>
    <div class="solar-coordinates grid grid-cols-2 gap-12px">
      <div class="flex-col-stretch gap-8px min-w-0">
        <label class="text-13px text-base-text-2">{{ $t("common.scheduleEditor.latitude") }}</label>
        <NInputNumber
          v-model:value="model.latitude"
          placeholder="31.2304"
          :min="-90"
          :max="90"
          :step="0.0001"
          :disabled="disabled"
          :input-props="{ 'aria-label': $t('common.scheduleEditor.latitude') }"
          class="w-full"
        />
        <p class="text-11px text-base-text-3">{{ $t("common.scheduleEditor.latitudeHint") }}</p>
      </div>
      <div class="flex-col-stretch gap-8px min-w-0">
        <label class="text-13px text-base-text-2">{{ $t("common.scheduleEditor.longitude") }}</label>
        <NInputNumber
          v-model:value="model.longitude"
          placeholder="121.4737"
          :min="-180"
          :max="180"
          :step="0.0001"
          :disabled="disabled"
          :input-props="{ 'aria-label': $t('common.scheduleEditor.longitude') }"
          class="w-full"
        />
        <p class="text-11px text-base-text-3">{{ $t("common.scheduleEditor.longitudeHint") }}</p>
      </div>
    </div>
    <NAlert v-if="!valid" type="error" role="alert">{{ $t("common.scheduleEditor.solarError") }}</NAlert>
    <NAlert v-else type="info" :show-icon="false" aria-live="polite">{{
      $t("common.scheduleEditor.solarSummary", {
        event: $t(`common.scheduleEditor.events.${model.event}`),
        coordinates,
      })
    }}</NAlert>
    <PreviewPanel
      :preview="preview"
      :loading="loading"
      :failed="previewFailed"
      :invalid="!valid"
      :hint="$t('common.scheduleEditor.solarHint')"
      @refresh="refresh"
    />
  </section>
</template>

<style scoped>
  .solar-editor {
    container-type: inline-size;
  }
  @container (max-width: 380px) {
    .solar-coordinates {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useClipboard } from "@vueuse/core"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import { cronFields, cronModes, formatCron, minuteIntervals } from "./cron"
  import type { CrontabValue, PreviewLoader } from "./cron"
  import PreviewPanel from "../schedule-editor/preview-panel.vue"
  import { useCrontabEditor } from "./use-crontab-editor"

  defineOptions({ name: "CrontabEditor" })
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
  }))
  const props = withDefaults(defineProps<{ loadPreview: PreviewLoader; disabled?: boolean }>(), { disabled: false })
  const emit = defineEmits<{ "validity-change": [valid: boolean] }>()
  const model = defineModel<CrontabValue>({ required: true })
  const { draft, encoded, localError, preview, previewFailed, loading, setMode, refresh, validate } = useCrontabEditor(
    model,
    () => props.loadPreview,
  )
  const { copy, copied } = useClipboard({ legacy: true })
  const copyFailed = ref(false)
  const weekdays = [1, 2, 3, 4, 5, 6, 0] as const
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
  const minuteOptions = computed(() =>
    minuteIntervals.map((value) => ({ label: $t("common.crontabEditor.minuteOption", { count: value }), value })),
  )
  const hourlyOptions = Array.from({ length: 60 }, (_, value) => ({ label: String(value).padStart(2, "0"), value }))
  const expression = computed(() => (encoded.value.value ? formatCron(encoded.value.value) : ""))
  const error = computed(() => {
    if (localError.value) return $t(`common.crontabEditor.error.${localError.value}`)
    if (preview.value && !preview.value.valid)
      return $t("common.crontabEditor.error.invalidField", {
        field: preview.value.errorField
          ? $t(`common.crontabEditor.fields.${preview.value.errorField}`)
          : $t("common.crontabEditor.expression"),
      })
    return ""
  })
  const summary = computed(() => {
    if (error.value) return ""
    const params = {
      count: draft.value.interval,
      minute: String(draft.value.minute).padStart(2, "0"),
      time: draft.value.time,
      days:
        draft.value.mode === "weekly"
          ? weekdays
              .filter((day) => draft.value.weekdays.includes(day))
              .map((day) => $t(`common.crontabEditor.weekdays.${weekdayKeys[day]}`))
              .join($t("common.crontabEditor.separator"))
          : [...draft.value.monthDays].sort((a, b) => a - b).join($t("common.crontabEditor.separator")),
    }
    return $t(`common.crontabEditor.summary.${draft.value.mode}`, params)
  })
  watch(
    [preview, localError, previewFailed, loading],
    () => {
      emit(
        "validity-change",
        Boolean(preview.value?.valid && !localError.value && !previewFailed.value && !loading.value),
      )
    },
    { immediate: true },
  )

  function toggle(group: "weekdays" | "monthDays", value: number) {
    const selected = draft.value[group]
    draft.value[group] = selected.includes(value) ? selected.filter((day) => day !== value) : [...selected, value]
  }
  async function copyValue(value: string) {
    copyFailed.value = false
    try {
      await copy(value)
    } catch {
      copyFailed.value = true
    }
  }
  defineExpose({ validate, refresh })
</script>

<template>
  <section
    class="cron-editor flex-col-stretch gap-16px min-w-0 rd-12px border border-theme-default bg-theme-body p-16px"
    :style="themeStyle"
    :aria-label="$t('common.crontabEditor.title')"
  >
    <div class="flex-y-center justify-between flex-wrap gap-8px">
      <div class="flex-y-center gap-8px font-600 text-15px">
        <SvgIcon icon="carbon:calendar" class="text-primary text-18px" />
        {{ $t("common.crontabEditor.title") }}
      </div>
      <NTag v-if="preview" size="small" :bordered="false" class="max-w-full">
        <span class="break-all text-12px">{{ preview.timezone }}</span>
      </NTag>
    </div>
    <div class="grid grid-cols-3 gap-8px" role="group" :aria-label="$t('common.crontabEditor.frequency')">
      <NButton
        v-for="mode in cronModes"
        :key="mode"
        :type="draft.mode === mode ? 'primary' : 'default'"
        :secondary="draft.mode === mode"
        :aria-pressed="draft.mode === mode"
        :disabled="disabled"
        class="h-auto min-h-38px py-8px"
        @click="setMode(mode)"
      >
        <span class="whitespace-normal text-12px">{{ $t(`common.crontabEditor.modes.${mode}`) }}</span>
      </NButton>
    </div>

    <div v-if="draft.mode === 'minutes'" class="flex-col-stretch gap-8px">
      <label class="text-13px text-base-text-2">{{ $t("common.crontabEditor.interval") }}</label>
      <NSelect
        v-model:value="draft.interval"
        :options="minuteOptions"
        :disabled="disabled"
        :aria-label="$t('common.crontabEditor.interval')"
      />
      <p class="text-12px text-base-text-3">{{ $t("common.crontabEditor.clockAligned") }}</p>
    </div>
    <div v-else-if="draft.mode === 'hourly'" class="flex-col-stretch gap-8px">
      <label class="text-13px text-base-text-2">{{ $t("common.crontabEditor.hourMinute") }}</label>
      <NSelect
        v-model:value="draft.minute"
        :options="hourlyOptions"
        :disabled="disabled"
        :aria-label="$t('common.crontabEditor.hourMinute')"
      />
    </div>
    <div v-else-if="draft.mode === 'advanced'" class="flex-col-stretch gap-8px">
      <label class="text-13px text-base-text-2">{{ $t("common.crontabEditor.expression") }}</label>
      <NInput
        v-model:value="draft.expression"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 4 }"
        placeholder="30 9 * * 1-5"
        :status="error ? 'error' : undefined"
        :disabled="disabled"
        :aria-label="$t('common.crontabEditor.expression')"
        :input-props="{ 'aria-label': $t('common.crontabEditor.expression') }"
      />
      <p class="text-12px text-base-text-3 leading-relaxed">{{ $t("common.crontabEditor.advancedHint") }}</p>
    </div>
    <div v-else class="flex-col-stretch gap-14px">
      <div v-if="draft.mode === 'weekly'" class="flex-col-stretch gap-8px">
        <span class="text-13px text-base-text-2">{{ $t("common.crontabEditor.selectWeekdays") }}</span>
        <div
          class="cron-weekdays grid grid-cols-7 gap-6px"
          role="group"
          :aria-label="$t('common.crontabEditor.selectWeekdays')"
        >
          <NButton
            v-for="day in weekdays"
            :key="day"
            size="small"
            :type="draft.weekdays.includes(day) ? 'primary' : 'default'"
            :secondary="draft.weekdays.includes(day)"
            :aria-pressed="draft.weekdays.includes(day)"
            :disabled="disabled"
            @click="toggle('weekdays', day)"
          >
            {{ $t(`common.crontabEditor.weekdays.${weekdayKeys[day]}`) }}
          </NButton>
        </div>
        <div class="flex-y-center flex-wrap gap-6px">
          <NButton size="small" secondary :disabled="disabled" @click="draft.weekdays = [1, 2, 3, 4, 5]">{{
            $t("common.crontabEditor.workdays")
          }}</NButton>
          <NButton size="small" secondary :disabled="disabled" @click="draft.weekdays = [6, 0]">{{
            $t("common.crontabEditor.weekend")
          }}</NButton>
          <NButton size="small" secondary :disabled="disabled" @click="draft.weekdays = [...weekdays]">{{
            $t("common.crontabEditor.everyDay")
          }}</NButton>
        </div>
      </div>
      <div v-if="draft.mode === 'monthly'" class="flex-col-stretch gap-8px">
        <span class="text-13px text-base-text-2">{{ $t("common.crontabEditor.selectDays") }}</span>
        <div
          class="cron-dates grid grid-cols-7 gap-6px"
          role="group"
          :aria-label="$t('common.crontabEditor.selectDays')"
        >
          <NButton
            v-for="day in 31"
            :key="day"
            size="small"
            :type="draft.monthDays.includes(day) ? 'primary' : 'default'"
            :secondary="draft.monthDays.includes(day)"
            :aria-pressed="draft.monthDays.includes(day)"
            :disabled="disabled"
            :aria-label="$t('common.crontabEditor.dateOption', { day })"
            @click="toggle('monthDays', day)"
            >{{ day }}</NButton
          >
        </div>
        <p class="text-12px text-base-text-3 leading-relaxed">{{ $t("common.crontabEditor.monthHint") }}</p>
      </div>
      <div class="flex-col-stretch gap-8px">
        <label class="text-13px text-base-text-2">{{ $t("common.crontabEditor.time") }}</label>
        <NTimePicker
          v-model:formatted-value="draft.time"
          value-format="HH:mm"
          format="HH:mm"
          :disabled="disabled"
          class="w-full"
          :aria-label="$t('common.crontabEditor.time')"
        />
      </div>
    </div>

    <NAlert v-if="error" type="error" role="alert">{{ error }}</NAlert>
    <NAlert v-else type="info" :show-icon="false" aria-live="polite">
      {{ summary }}
    </NAlert>

    <div class="flex-col-stretch gap-8px">
      <div class="flex-y-center justify-between gap-8px">
        <span class="font-600 text-13px">{{ $t("common.crontabEditor.expression") }}</span>
        <NButton
          size="tiny"
          quaternary
          :disabled="!expression"
          :aria-label="$t('common.crontabEditor.copyExpression')"
          @click="copyValue(expression)"
        >
          <template #icon><SvgIcon :icon="copied ? 'carbon:checkmark' : 'carbon:copy'" /></template>
          {{ $t(copied ? "common.crontabEditor.copied" : "common.crontabEditor.copy") }}
        </NButton>
      </div>
      <div
        class="grid grid-cols-5 rd-8px border border-theme-default overflow-hidden bg-theme-fill"
        :aria-label="expression || $t('common.crontabEditor.emptyExpression')"
      >
        <div
          v-for="field in cronFields"
          :key="field"
          class="cron-field min-w-0 text-center px-4px py-10px"
          :class="{ 'text-error': preview?.errorField === field }"
        >
          <code class="block font-mono text-15px font-600 break-all">{{ encoded.value?.[field] ?? "—" }}</code>
          <span class="block mt-5px text-11px text-base-text-3">{{ $t(`common.crontabEditor.fields.${field}`) }}</span>
        </div>
      </div>
    </div>

    <PreviewPanel
      :preview="preview"
      :loading="loading"
      :failed="previewFailed"
      :invalid="Boolean(error)"
      @refresh="refresh"
    />
    <p v-if="copyFailed" role="alert" class="text-12px text-error">{{ $t("common.crontabEditor.copyFailed") }}</p>
    <span class="sr-only" role="status">{{ copied ? $t("common.crontabEditor.copied") : "" }}</span>
  </section>
</template>

<style scoped>
  .cron-editor {
    container-type: inline-size;
  }
  .cron-field + .cron-field {
    border-left: 1px solid var(--border-color);
  }
  .cron-run + .cron-run {
    border-top: 1px solid var(--border-color);
  }
  @container (max-width: 380px) {
    .cron-weekdays {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .cron-dates {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
  @media (pointer: coarse) {
    .cron-weekdays :deep(.n-button),
    .cron-dates :deep(.n-button) {
      min-height: 44px;
    }
  }
</style>

<script setup lang="ts">
  import { computed, ref } from "vue"
  import { $t } from "@/locales"
  import CrontabEditor from "../crontab-editor/index.vue"
  import IntervalEditor from "../interval-editor/index.vue"
  import SolarEditor from "../solar-editor/index.vue"
  import type { CrontabValue, CrontabPreview } from "../crontab-editor/cron"
  import { cronFields } from "../crontab-editor/cron"
  import { scheduleTypes } from "./schedule"
  import type { IntervalValue, SolarValue, ScheduleValue, PreviewLoader } from "./schedule"
  import { useScheduleEditor } from "./use-schedule-editor"

  defineOptions({ name: "ScheduleEditor" })
  const props = withDefaults(defineProps<{ disabled?: boolean; loadPreview: PreviewLoader<ScheduleValue> }>(), {
    disabled: false,
  })
  const emit = defineEmits<{ "validity-change": [valid: boolean] }>()
  const model = defineModel<ScheduleValue>({ required: true })
  const { kind, session, drafts, select, update } = useScheduleEditor(model)
  const editorRef = ref<{ validate: () => Promise<boolean>; refresh: () => Promise<boolean> } | null>(null)
  const icons = { interval: "carbon:timer", crontab: "carbon:calendar", solar: "carbon:sun" }
  const loadInterval: PreviewLoader<IntervalValue> = (value) => props.loadPreview({ ...value, type: "interval" })
  const loadSolar: PreviewLoader<SolarValue> = (value) => props.loadPreview({ ...value, type: "solar" })
  async function loadCrontab(value: CrontabValue): Promise<CrontabPreview | null> {
    const result = await props.loadPreview({ ...value, type: "crontab" })
    if (!result) return null
    return {
      ...result,
      errorField: cronFields.includes(result.errorField as keyof CrontabValue)
        ? (result.errorField as keyof CrontabValue)
        : null,
    }
  }
  const intervalValue = computed(() => drafts.value.interval as IntervalValue)
  const crontabValue = computed(() => drafts.value.crontab as CrontabValue)
  const solarValue = computed(() => drafts.value.solar as SolarValue)
  function onUpdate(value: IntervalValue | CrontabValue | SolarValue) {
    update(kind.value, Object.assign(value, { type: kind.value }) as ScheduleValue)
  }
  function onSelect(type: typeof kind.value) {
    select(type)
    emit("validity-change", false)
  }
  async function validate(): Promise<boolean> {
    const snapshot = JSON.stringify(model.value)
    const active = editorRef.value
    const valid = await active?.validate()
    return Boolean(valid && active === editorRef.value && snapshot === JSON.stringify(model.value))
  }
  async function refresh() {
    return (await editorRef.value?.refresh()) ?? false
  }
  defineExpose({ validate, refresh })
</script>

<template>
  <div class="flex-col-stretch gap-12px min-w-0" :aria-label="$t('common.scheduleEditor.title')">
    <div class="grid grid-cols-3 gap-8px" role="group" :aria-label="$t('common.scheduleEditor.title')">
      <NButton
        v-for="type in scheduleTypes"
        :key="type"
        :type="kind === type ? 'primary' : 'default'"
        :secondary="kind === type"
        :aria-pressed="kind === type"
        :disabled="disabled"
        class="h-auto min-h-48px px-4px py-10px"
        @click="onSelect(type)"
      >
        <span class="flex-col-center gap-6px whitespace-normal text-12px"
          ><SvgIcon :icon="icons[type]" class="text-18px" />{{ $t(`common.scheduleEditor.types.${type}`) }}</span
        >
      </NButton>
    </div>
    <KeepAlive :key="session" :max="3">
      <IntervalEditor
        v-if="kind === 'interval'"
        key="interval"
        ref="editorRef"
        :model-value="intervalValue"
        :load-preview="loadInterval"
        :disabled="disabled"
        @update:model-value="onUpdate"
        @validity-change="kind === 'interval' && emit('validity-change', $event)"
      />
      <CrontabEditor
        v-else-if="kind === 'crontab'"
        key="crontab"
        ref="editorRef"
        :model-value="crontabValue"
        :load-preview="loadCrontab"
        :disabled="disabled"
        @update:model-value="onUpdate"
        @validity-change="kind === 'crontab' && emit('validity-change', $event)"
      />
      <SolarEditor
        v-else
        key="solar"
        ref="editorRef"
        :model-value="solarValue"
        :load-preview="loadSolar"
        :disabled="disabled"
        @update:model-value="onUpdate"
        @validity-change="kind === 'solar' && emit('validity-change', $event)"
      />
    </KeepAlive>
  </div>
</template>

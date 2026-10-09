<script setup lang="ts">
  import { computed, toRaw, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { VueDraggable } from "vue-draggable-plus"
  import { $t } from "@/locales"
  import { formatPythonCall } from "./arguments"
  import type { ArgumentRow, ArgumentType, PythonArguments } from "./arguments"
  import CodePreview from "./code-preview.vue"
  import { usePythonArguments } from "./use-python-arguments"

  defineOptions({ name: "PythonArgumentsEditor" })
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
    "--pa-focus": theme.value.primaryColor,
    "--pa-error": theme.value.errorColor,
  }))
  const props = withDefaults(defineProps<{ functionName?: string; disabled?: boolean; showPreview?: boolean }>(), {
    functionName: "task",
    disabled: false,
    showPreview: true,
  })
  const emit = defineEmits<{ "validity-change": [valid: boolean] }>()
  const model = defineModel<PythonArguments>({ required: true })
  const { args, kwargs, result, commit, move } = usePythonArguments(model)
  type EditorKey = Extract<I18nKeys.common, `pythonArguments.${string}`>
  const text = (key: EditorKey) => $t(`common.${key}`)
  const options = computed(() =>
    (["string", "number", "boolean", "none", "json"] as ArgumentType[]).map((value) => ({
      value,
      label: text(`pythonArguments.${value}`),
    })),
  )
  const booleanOptions = [
    { label: "True", value: "true" },
    { label: "False", value: "false" },
  ]
  const groups = computed(() => [
    {
      name: "args" as const,
      title: text("pythonArguments.args"),
      hint: text("pythonArguments.argsHint"),
      rows: args.value,
    },
    {
      name: "kwargs" as const,
      title: text("pythonArguments.kwargs"),
      hint: text("pythonArguments.kwargsHint"),
      rows: kwargs.value,
    },
  ])
  const error = computed(() => {
    if (!result.value.error) return ""
    const location =
      result.value.group && result.value.index !== undefined ? `${result.value.group}[${result.value.index}] · ` : ""
    return location + text(`pythonArguments.error.${result.value.error}` as EditorKey)
  })
  const preview = computed(() => (result.value.value ? formatPythonCall(props.functionName, result.value.value) : ""))
  const payload = computed(() => JSON.stringify(result.value.value, null, 2))
  const rowIds = new WeakMap<ArgumentRow, number>()
  let nextRowId = 0
  function rowId(row: ArgumentRow) {
    const raw = toRaw(row)
    if (!rowIds.has(raw)) rowIds.set(raw, ++nextRowId)
    return rowIds.get(raw)!
  }
  function reorder(group: "args" | "kwargs", rows: ArgumentRow[]) {
    if (group === "args" && !props.disabled) args.value = rows
  }
  function changeType(row: ArgumentRow, type: ArgumentType) {
    row.type = type
    row.value = { string: "", number: "0", boolean: "true", none: "", json: "{}" }[type]
  }
  function add(group: "args" | "kwargs") {
    if (group === "args") args.value.push({ type: "string", value: "" })
    else kwargs.value.push({ key: "", type: "string", value: "" })
  }
  watch(
    () => !result.value.error,
    (valid) => emit("validity-change", valid),
    { immediate: true },
  )
  defineExpose({ validate: commit })
</script>

<template>
  <div class="python-arguments-editor flex-col-stretch gap-24px w-full min-w-0" :style="themeStyle">
    <section v-for="group in groups" :key="group.name" class="flex-col-stretch gap-12px" :aria-label="group.title">
      <div class="flex-y-center justify-between gap-12px">
        <div class="min-w-0">
          <div class="flex-y-center flex-wrap gap-8px">
            <span class="font-600 text-14px">{{ group.title }}</span>
            <code class="text-12px text-base-text-3">{{ group.name === "args" ? "*args" : "**kwargs" }}</code>
            <NTag round size="small" :bordered="false">{{ group.rows.length }}</NTag>
          </div>
          <p class="m-0 mt-4px text-12px text-base-text-3">{{ group.hint }}</p>
        </div>
        <NButton size="small" secondary :disabled="disabled" class="shrink-0" @click="add(group.name)">
          <template #icon><icon-carbon-add /></template>{{ text("pythonArguments.add") }}
        </NButton>
      </div>
      <div
        v-if="!group.rows.length"
        class="flex-center gap-8px py-20px rd-8px border border-dashed border-theme-default text-base-text-3 text-13px"
      >
        <icon-carbon-parameter />{{ text("pythonArguments.empty") }}
      </div>
      <VueDraggable
        :model-value="group.rows"
        :disabled="disabled || group.name !== 'args'"
        :animation="150"
        handle=".argument-drag-handle"
        filter=".argument-actions"
        :prevent-on-filter="false"
        draggable=".argument-card"
        ghost-class="argument-drag-ghost"
        chosen-class="argument-drag-chosen"
        class="flex-col-stretch gap-12px"
        @update:model-value="reorder(group.name, $event)"
      >
        <article
          v-for="(row, index) in group.rows"
          :key="rowId(row)"
          class="argument-card overflow-hidden rd-8px border border-theme-default bg-theme-body"
          :class="{ 'border-theme-error': result.group === group.name && result.index === index }"
        >
          <header
            :class="{ 'argument-drag-handle': group.name === 'args' && !disabled }"
            class="flex-y-center flex-wrap justify-between gap-8px bg-theme-fill px-12px py-8px border-b border-theme-default"
          >
            <div class="flex-y-center gap-8px min-w-0">
              <icon-carbon-draggable v-if="group.name === 'args'" class="text-base-text-3" aria-hidden="true" />
              <span
                class="flex-center size-24px bg-theme-body rd-6px text-12px font-600 text-base-text-2 tabular-nums"
                >{{ String(index + 1).padStart(2, "0") }}</span
              >
              <code class="text-12px text-base-text-2">{{ group.name }}[{{ index }}]</code>
            </div>
            <div class="argument-actions flex-y-center gap-4px">
              <template v-if="group.name === 'args'">
                <NButton
                  quaternary
                  size="tiny"
                  :disabled="disabled || index === 0"
                  :aria-label="text('pythonArguments.up')"
                  :title="text('pythonArguments.up')"
                  @click="move(index, -1)"
                  ><template #icon><icon-carbon-arrow-up /></template
                ></NButton>
                <NButton
                  quaternary
                  size="tiny"
                  :disabled="disabled || index === args.length - 1"
                  :aria-label="text('pythonArguments.down')"
                  :title="text('pythonArguments.down')"
                  @click="move(index, 1)"
                  ><template #icon><icon-carbon-arrow-down /></template
                ></NButton>
                <span class="mx-4px h-12px border-l border-theme-default"></span>
              </template>
              <NButton
                quaternary
                size="tiny"
                type="error"
                :disabled="disabled"
                :aria-label="$t('common.delete')"
                :title="$t('common.delete')"
                @click="group.name === 'args' ? args.splice(index, 1) : kwargs.splice(index, 1)"
                ><template #icon><icon-carbon-trash-can /></template
              ></NButton>
            </div>
          </header>
          <div class="flex-col-stretch gap-12px p-12px">
            <div class="argument-fields" :class="{ 'positional-fields': group.name === 'args' }">
              <label v-if="group.name === 'kwargs'" class="flex-col-stretch gap-6px min-w-0">
                <span class="text-12px text-base-text-2">{{ text("pythonArguments.key") }}</span>
                <NInput
                  v-model:value="kwargs[index]!.key"
                  :disabled="disabled"
                  :placeholder="text('pythonArguments.keyPlaceholder')"
                  :aria-label="text('pythonArguments.key')"
                />
              </label>
              <label class="flex-col-stretch gap-6px min-w-0">
                <span class="text-12px text-base-text-2">{{ text("pythonArguments.type") }}</span>
                <NSelect
                  :value="row.type"
                  :options="options"
                  :disabled="disabled"
                  :aria-label="text('pythonArguments.type')"
                  @update:value="changeType(row, $event)"
                />
              </label>
              <label
                class="argument-value flex-col-stretch gap-6px min-w-0"
                :class="{ 'full-value': group.name === 'kwargs' || row.type === 'json' }"
              >
                <span class="text-12px text-base-text-2">{{ text("pythonArguments.value") }}</span>
                <NSelect
                  v-if="row.type === 'boolean'"
                  v-model:value="row.value"
                  :options="booleanOptions"
                  :disabled="disabled"
                  :aria-label="text('pythonArguments.value')"
                />
                <div v-else-if="row.type === 'none'" class="flex-y-center gap-8px p-8px bg-theme-fill rd-6px">
                  <code class="text-info text-13px">None</code
                  ><span class="text-base-text-3 text-12px">{{ text("pythonArguments.noneHint") }}</span>
                </div>
                <NInput
                  v-else
                  v-model:value="row.value"
                  :type="row.type === 'json' ? 'textarea' : 'text'"
                  :autosize="{ minRows: 3, maxRows: 10 }"
                  :disabled="disabled"
                  :placeholder="
                    row.type === 'json' ? JSON.stringify([1, { key: 'value' }]) : text('pythonArguments.value')
                  "
                  :aria-label="text('pythonArguments.value')"
                  :class="{ 'argument-json-input': row.type === 'json' }"
                />
              </label>
            </div>
            <p
              v-if="result.group === group.name && result.index === index"
              role="alert"
              class="m-0 text-error text-12px"
            >
              {{ error }}
            </p>
          </div>
        </article>
      </VueDraggable>
    </section>
    <section v-if="showPreview" class="flex-col-stretch gap-8px border-t border-theme-default pt-16px">
      <div class="flex-y-center gap-8px text-14px font-600">
        <icon-carbon-code />{{ text("pythonArguments.output") }}
      </div>
      <NAlert v-if="error" type="warning" :show-icon="false">{{ text("pythonArguments.invalidPreview") }}</NAlert>
      <NTabs v-else type="line" animated>
        <NTabPane name="python" :tab="text('pythonArguments.preview')"
          ><CodePreview :code="preview" language="python"
        /></NTabPane>
        <NTabPane name="json" :tab="text('pythonArguments.payload')"
          ><CodePreview :code="payload" language="json"
        /></NTabPane>
      </NTabs>
    </section>
  </div>
</template>

<style scoped>
  .python-arguments-editor {
    container-type: inline-size;
  }
  .argument-drag-handle {
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .argument-drag-handle:active,
  .argument-drag-chosen .argument-drag-handle {
    cursor: grabbing;
  }
  .argument-actions {
    cursor: default;
  }
  .argument-drag-ghost {
    opacity: 0.4;
  }
  .argument-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  @container (min-width: 400px) {
    .argument-fields {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .positional-fields {
      grid-template-columns: 140px minmax(0, 1fr);
    }
    .full-value {
      grid-column: 1 / -1;
    }
  }
  .argument-card {
    transition: border-color 150ms ease;
  }
  .argument-card:focus-within {
    border-color: var(--pa-focus);
  }
  .argument-card.border-theme-error:focus-within {
    border-color: var(--pa-error);
  }
  .argument-json-input :deep(textarea) {
    font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
  }
  @media (prefers-reduced-motion: reduce) {
    .argument-card {
      transition: none;
    }
  }
</style>

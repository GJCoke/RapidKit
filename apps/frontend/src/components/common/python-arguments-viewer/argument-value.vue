<script setup lang="ts">
  import { computed, ref } from "vue"
  import { $t } from "@/locales"
  import { formatPython } from "../python-arguments-editor/arguments"

  defineOptions({ name: "ArgumentValue" })
  const props = defineProps<{ label: string; value: unknown }>()
  const expanded = ref(false)
  const entries = computed(() => {
    if (Array.isArray(props.value)) return props.value.map((value, index) => ({ label: `[${index}]`, value }))
    if (props.value && typeof props.value === "object")
      return Object.entries(props.value).map(([label, value]) => ({ label, value }))
    return null
  })
  const type = computed(() => {
    if (props.value === null) return "None"
    if (Array.isArray(props.value)) return "list"
    if (typeof props.value === "object") return "dict"
    if (typeof props.value === "boolean") return "bool"
    if (typeof props.value === "number") return Number.isInteger(props.value) ? "int" : "float"
    if (typeof props.value === "string") return "str"
    return typeof props.value
  })
  const display = computed(() => formatPython(props.value) ?? String(props.value))
  function toggle(event: Event) {
    expanded.value = (event.target as HTMLDetailsElement).open
  }
</script>

<template>
  <div class="argument-value px-12px py-10px text-13px leading-20px min-w-0">
    <div class="argument-value-fields">
      <code class="font-mono whitespace-pre-wrap break-all min-w-0">{{ label || '""' }}</code>
      <span class="justify-self-start rd-4px bg-theme-fill px-6px py-1px text-11px text-base-text-3">{{ type }}</span>
      <div class="argument-value-content min-w-0 font-mono whitespace-pre-wrap break-all">
        <details v-if="entries?.length" @toggle="toggle">
          <summary class="cursor-pointer min-w-0">
            {{
              $t(Array.isArray(value) ? "common.pythonArgumentsViewer.items" : "common.pythonArgumentsViewer.fields", {
                count: entries.length,
              })
            }}
          </summary>
          <div v-if="expanded" class="mt-8px ml-4px pl-8px border-l border-theme-default">
            <ArgumentValue v-for="entry in entries" :key="entry.label" :label="entry.label" :value="entry.value" />
          </div>
        </details>
        <span v-else :class="typeof value === 'string' ? 'argument-string' : 'argument-literal'">{{ display }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .argument-value {
    container-type: inline-size;
  }
  .argument-value + .argument-value {
    border-top: 1px solid var(--border-color);
  }
  .argument-value-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 10px;
    align-items: start;
  }
  .argument-value-content {
    grid-column: 1 / -1;
  }
  .argument-string {
    color: var(--pav-string);
  }
  .argument-literal {
    color: var(--pav-literal);
  }
  @container (min-width: 440px) {
    .argument-value-fields {
      grid-template-columns: minmax(90px, 128px) 64px minmax(0, 1fr);
      gap: 10px;
    }
    .argument-value-content {
      grid-column: auto;
    }
  }
  @media (pointer: coarse) {
    summary {
      min-height: 44px;
    }
  }
</style>

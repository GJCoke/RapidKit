<script setup lang="ts">
  import { computed, ref } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import { formatPythonCall } from "../python-arguments-editor/arguments"
  import CodePreview from "../python-arguments-editor/code-preview.vue"
  import ArgumentValue from "./argument-value.vue"

  defineOptions({ name: "PythonArgumentsViewer" })
  const props = withDefaults(
    defineProps<{
      args?: readonly unknown[] | null
      kwargs?: Readonly<Record<string, unknown>> | null
      functionName?: string
      showPreview?: boolean
    }>(),
    { functionName: "task", showPreview: true },
  )
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
    "--pav-string": theme.value.successColor,
    "--pav-literal": theme.value.infoColor,
  }))
  const previewOpen = ref(false)
  const groups = computed(() => [
    {
      name: "args",
      title: $t("common.pythonArguments.args"),
      symbol: "*args",
      empty: $t("common.pythonArgumentsViewer.emptyArgs"),
      entries: (props.args ?? []).map((value, index) => ({ label: `[${index}]`, value })),
    },
    {
      name: "kwargs",
      title: $t("common.pythonArguments.kwargs"),
      symbol: "**kwargs",
      empty: $t("common.pythonArgumentsViewer.emptyKwargs"),
      entries: Object.entries(props.kwargs ?? {}).map(([label, value]) => ({ label, value })),
    },
  ])
  const preview = computed(() =>
    formatPythonCall(props.functionName, { args: [...(props.args ?? [])], kwargs: props.kwargs ?? {} }),
  )
  function togglePreview(event: Event) {
    previewOpen.value = (event.target as HTMLDetailsElement).open
  }
</script>

<template>
  <div class="python-arguments-viewer flex-col-stretch gap-24px w-full min-w-0" :style="themeStyle">
    <section v-for="group in groups" :key="group.name" :aria-label="group.title" class="min-w-0">
      <div class="flex-y-center flex-wrap gap-8px mb-10px">
        <span class="font-600 text-14px">{{ group.title }}</span>
        <code class="text-12px text-base-text-3">{{ group.symbol }}</code>
        <NTag round size="small" :bordered="false">{{ group.entries.length }}</NTag>
      </div>
      <div v-if="group.entries.length" class="rd-8px border border-theme-default overflow-hidden">
        <ArgumentValue v-for="entry in group.entries" :key="entry.label" :label="entry.label" :value="entry.value" />
      </div>
      <div v-else class="py-16px px-12px rd-8px bg-theme-fill text-13px text-base-text-3">{{ group.empty }}</div>
    </section>
    <details v-if="showPreview" class="border-t border-theme-default pt-12px" @toggle="togglePreview">
      <summary class="cursor-pointer text-13px font-600">{{ $t("common.pythonArguments.preview") }}</summary>
      <CodePreview v-if="previewOpen" :code="preview" language="python" class="mt-12px" />
    </details>
  </div>
</template>

<style scoped>
  @media (pointer: coarse) {
    summary {
      min-height: 44px;
    }
  }
</style>

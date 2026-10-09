<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import { tokenizeCode } from "@/utils/code-tokens"
  import { copyText, downloadText, safeFilename } from "@/utils/text-actions"
  import { serializeJson } from "./json"

  defineOptions({ name: "JsonViewer" })
  const props = defineProps<{ value: unknown; title?: string; filename?: string; maxHeight?: number }>()
  const wrap = defineModel<boolean>("wrap", { default: true })
  const showLineNumbers = defineModel<boolean>("showLineNumbers", { default: true })
  const serialized = computed(() => serializeJson(props.value))
  const lines = computed(() =>
    serialized.value.valid ? serialized.value.code.split("\n").map((line) => tokenizeCode(line, "json")) : [],
  )
  const maxHeight = computed(() =>
    props.maxHeight && Number.isSafeInteger(props.maxHeight) && props.maxHeight > 0 ? props.maxHeight : 360,
  )
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
    "--jv-text": theme.value.textColor1,
    "--jv-muted": theme.value.textColor3,
    "--jv-property": theme.value.primaryColor,
    "--jv-string": theme.value.successColor,
    "--jv-number": theme.value.warningColor,
    "--jv-keyword": theme.value.infoColor,
  }))
  const feedback = ref<"copied" | "copyFailed" | "downloadFailed" | "">("")
  const copying = ref(false)
  let revision = 0
  watch(serialized, () => {
    revision++
    feedback.value = ""
  })
  async function copy() {
    const current = revision
    feedback.value = ""
    copying.value = true
    try {
      await copyText(serialized.value.code)
      if (current === revision) feedback.value = "copied"
    } catch {
      if (current === revision) feedback.value = "copyFailed"
    } finally {
      copying.value = false
    }
  }
  function download() {
    feedback.value = ""
    try {
      downloadText(
        serialized.value.code,
        safeFilename(props.filename ?? "data.json", "data.json"),
        "application/json;charset=utf-8",
      )
    } catch {
      feedback.value = "downloadFailed"
    }
  }
</script>

<template>
  <section
    class="json-viewer w-full min-w-0 overflow-hidden rd-8px border border-theme-default bg-theme-body"
    :style="themeStyle"
  >
    <div
      class="flex-y-center flex-wrap justify-between gap-8px px-14px py-10px border-b border-theme-default bg-theme-fill"
    >
      <span class="text-14px font-600"
        ><slot name="title">{{ title ?? $t("common.jsonViewer.title") }}</slot></span
      >
      <div class="flex-y-center flex-wrap gap-10px">
        <NCheckbox v-model:checked="wrap">{{ $t("common.jsonViewer.wrap") }}</NCheckbox>
        <NCheckbox v-model:checked="showLineNumbers">{{ $t("common.jsonViewer.lineNumbers") }}</NCheckbox>
        <NButton
          size="small"
          :disabled="!serialized.valid"
          :loading="copying"
          :aria-label="$t('common.jsonViewer.copy')"
          @click="copy"
          >{{ $t("common.jsonViewer.copy") }}</NButton
        >
        <NButton
          size="small"
          :disabled="!serialized.valid"
          :aria-label="$t('common.jsonViewer.download')"
          @click="download"
          >{{ $t("common.jsonViewer.download") }}</NButton
        >
      </div>
    </div>
    <NScrollbar v-if="serialized.valid" :style="{ maxHeight: `${maxHeight}px` }" :x-scrollable="!wrap">
      <div
        class="json-content py-12px"
        :class="{ 'no-wrap': !wrap, 'hide-numbers': !showLineNumbers }"
        tabindex="0"
        :aria-label="title ?? $t('common.jsonViewer.title')"
      >
        <div v-for="(line, index) in lines" :key="index" class="json-line">
          <span v-if="showLineNumbers" class="json-line-number" aria-hidden="true">{{ index + 1 }}</span>
          <code class="json-line-content"
            ><span v-for="(token, position) in line" :key="position" :class="`token-${token.kind}`">{{
              token.text
            }}</span></code
          >
        </div>
      </div>
    </NScrollbar>
    <div
      v-else
      class="px-14px py-20px text-13px"
      :class="value === undefined ? 'text-base-text-3' : 'text-error'"
      :role="value === undefined ? 'status' : 'alert'"
    >
      {{ $t(value === undefined ? "common.jsonViewer.empty" : "common.jsonViewer.invalid") }}
    </div>
    <div
      v-if="feedback"
      :role="feedback === 'copied' ? 'status' : 'alert'"
      class="px-14px pb-10px text-12px"
      :class="feedback === 'copied' ? 'text-success' : 'text-error'"
    >
      {{ $t(`common.jsonViewer.${feedback}`) }}
    </div>
  </section>
</template>

<style scoped>
  .json-content {
    color: var(--jv-text);
    font-size: 13px;
    line-height: 21px;
  }
  .json-line {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .json-line-number {
    padding-right: 12px;
    text-align: right;
    color: var(--jv-muted);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .json-line-content {
    padding-right: 14px;
    min-height: 21px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
  }
  .hide-numbers .json-line {
    grid-template-columns: minmax(0, 1fr);
    padding-left: 14px;
  }
  .no-wrap {
    width: max-content;
    min-width: 100%;
  }
  .no-wrap .json-line {
    grid-template-columns: 42px auto;
  }
  .no-wrap.hide-numbers .json-line {
    grid-template-columns: auto;
  }
  .no-wrap .json-line-content {
    white-space: pre;
    overflow-wrap: normal;
  }
  .token-property {
    color: var(--jv-property);
  }
  .token-string {
    color: var(--jv-string);
  }
  .token-number {
    color: var(--jv-number);
  }
  .token-keyword {
    color: var(--jv-keyword);
  }
  .token-punctuation {
    color: var(--jv-muted);
  }
</style>

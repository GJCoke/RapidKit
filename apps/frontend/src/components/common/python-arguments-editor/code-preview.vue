<script setup lang="ts">
  import { computed, ref } from "vue"
  import { useClipboard } from "@vueuse/core"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import { tokenizeCode } from "@/utils/code-tokens"
  import type { CodeLanguage } from "@/utils/code-tokens"

  defineOptions({ name: "PythonArgumentsCodePreview" })
  const theme = useThemeVars()
  const themeStyle = computed(() => ({
    "--pa-muted": theme.value.textColor3,
    "--pa-property": theme.value.primaryColor,
    "--pa-string": theme.value.successColor,
    "--pa-number": theme.value.warningColor,
    "--pa-keyword": theme.value.infoColor,
  }))
  const props = defineProps<{ code: string; language: CodeLanguage }>()
  const { copy, copied } = useClipboard({ legacy: true, copiedDuring: 2000 })
  const copyFailed = ref(false)
  const lines = computed(() => props.code.split("\n").map((line) => tokenizeCode(line, props.language)))
  async function copyCode() {
    copyFailed.value = false
    try {
      await copy(props.code)
    } catch {
      copyFailed.value = true
    }
  }
</script>

<template>
  <div class="overflow-hidden rd-8px border border-theme-default bg-theme-body" :style="themeStyle">
    <div class="flex-y-center justify-between gap-12px bg-theme-fill px-14px py-8px border-b border-theme-default">
      <div class="flex-y-center gap-8px min-w-0">
        <icon-carbon-code v-if="language === 'python'" class="text-16px shrink-0" />
        <icon-carbon-json v-else class="text-16px shrink-0" />
        <span class="font-mono text-12px font-600">{{ language === "python" ? "PYTHON" : "JSON" }}</span>
        <span class="text-12px text-base-text-3">{{
          $t("common.pythonArguments.lines", { count: lines.length })
        }}</span>
      </div>
      <NButton size="tiny" quaternary :aria-label="$t('common.pythonArguments.copy')" @click="copyCode">
        <template #icon><icon-carbon-checkmark v-if="copied" /><icon-carbon-copy v-else /></template>
        {{ $t(copied ? "common.pythonArguments.copied" : "common.pythonArguments.copy") }}
      </NButton>
    </div>
    <div
      class="py-12px"
      :aria-label="$t(language === 'python' ? 'common.pythonArguments.preview' : 'common.pythonArguments.payload')"
    >
      <div v-for="(line, index) in lines" :key="index" class="code-line">
        <span class="code-line-number" aria-hidden="true">{{ index + 1 }}</span>
        <code class="code-line-content"
          ><span v-for="(token, tokenIndex) in line" :key="tokenIndex" :class="`token-${token.kind}`">{{
            token.text
          }}</span></code
        >
      </div>
    </div>
    <div v-if="copyFailed" role="alert" class="px-14px pb-12px text-12px text-error">
      {{ $t("common.pythonArguments.copyFailed") }}
    </div>
    <span class="sr-only" role="status">{{ copied ? $t("common.pythonArguments.copied") : "" }}</span>
  </div>
</template>

<style scoped>
  .code-line {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    font-size: 13px;
    line-height: 1.8;
  }
  .code-line-number {
    padding-right: 12px;
    text-align: right;
    color: var(--pa-muted);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .code-line-content {
    padding-right: 14px;
    min-height: 1.8em;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
  }
  .token-property {
    color: var(--pa-property);
  }
  .token-string {
    color: var(--pa-string);
  }
  .token-number {
    color: var(--pa-number);
  }
  .token-keyword {
    color: var(--pa-keyword);
    font-weight: 600;
  }
  .token-punctuation {
    color: var(--pa-muted);
  }
</style>

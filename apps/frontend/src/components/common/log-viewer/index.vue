<script setup lang="ts">
  import { computed, ref, watch } from "vue"
  import { useThemeVars } from "naive-ui"
  import { $t } from "@/locales"
  import { copyLogs, downloadLogs } from "./browser-actions"
  import LogContent from "./log-content.vue"
  import type { LogLevel, LogViewerProps } from "./types"
  import { useLogViewer } from "./use-log-viewer"

  defineOptions({ name: "LogViewer" })
  const props = defineProps<Omit<LogViewerProps, "follow" | "wrap" | "showLineNumbers">>()
  const follow = defineModel<boolean>("follow", { default: true })
  const wrap = defineModel<boolean>("wrap", { default: true })
  const showLineNumbers = defineModel<boolean>("showLineNumbers", { default: true })
  const { query, level, pending, retained, visible, displayText, height, omitted, onScroll, resume } = useLogViewer(
    props,
    follow,
  )
  const theme = useThemeVars()
  const style = computed(() => ({
    "--border-color": theme.value.borderColor,
    "--body-color": theme.value.bodyColor,
    "--fill-color": theme.value.actionColor,
    "--lv-text": theme.value.textColor1,
    "--lv-muted": theme.value.textColor3,
    "--lv-warning": theme.value.warningColor,
    "--lv-error": theme.value.errorColor,
  }))
  const content = ref<InstanceType<typeof LogContent>>()
  const feedback = ref<"copied" | "copyFailed" | "exportFailed" | "">("")
  const copying = ref(false)
  const anchorLost = ref(false)
  watch([query, level, () => props.sourceKey], () => {
    anchorLost.value = false
  })
  watch(follow, (value) => {
    if (value) anchorLost.value = false
  })
  const hasEntries = computed(() => visible.value.length > 0)
  const levels = computed(() => [
    { label: $t("common.logViewer.allLevels"), value: "" },
    ...(["DEBUG", "INFO", "WARN", "ERROR"] as LogLevel[]).map((value) => ({ label: value, value })),
  ])
  async function copy() {
    feedback.value = ""
    copying.value = true
    try {
      await copyLogs(displayText.value)
      feedback.value = "copied"
    } catch {
      feedback.value = "copyFailed"
    } finally {
      copying.value = false
    }
  }
  function download() {
    feedback.value = ""
    try {
      downloadLogs(displayText.value, props.filename)
    } catch {
      feedback.value = "exportFailed"
    }
  }
  function scrollToBottom() {
    resume()
    content.value?.scrollToBottom()
  }
  function scrollToTop() {
    follow.value = false
    content.value?.scrollToTop()
  }
  function toggleFollow() {
    if (follow.value) follow.value = false
    else scrollToBottom()
  }
  defineExpose({ scrollToTop, scrollToBottom })
</script>

<template>
  <section
    class="log-viewer w-full min-w-0 overflow-hidden rd-8px border border-theme-default bg-theme-body"
    :style="style"
  >
    <div class="flex-y-center flex-wrap justify-between gap-8px px-14px py-10px border-b border-theme-default">
      <span class="text-14px font-600"
        ><slot name="title">{{ title ?? $t("common.logViewer.title") }}</slot></span
      >
      <span v-if="loading" role="status" class="flex-y-center gap-6px text-12px text-base-text-3">
        <NSpin size="small" />{{ $t("common.logViewer.loading") }}
      </span>
    </div>
    <div class="flex-y-center flex-wrap gap-8px px-12px py-10px bg-theme-fill border-b border-theme-default">
      <NInput
        v-model:value="query"
        clearable
        size="small"
        class="log-search"
        :placeholder="$t('common.logViewer.search')"
        :aria-label="$t('common.logViewer.search')"
      />
      <NSelect
        v-if="records !== undefined"
        v-model:value="level"
        size="small"
        class="log-level"
        :options="levels"
        :aria-label="$t('common.logViewer.level')"
      />
      <div class="flex-y-center flex-wrap gap-8px">
        <NButton size="small" :type="follow ? 'primary' : 'default'" :aria-pressed="follow" @click="toggleFollow">{{
          $t("common.logViewer.follow")
        }}</NButton>
        <NCheckbox v-model:checked="wrap">{{ $t("common.logViewer.wrap") }}</NCheckbox>
        <NCheckbox v-model:checked="showLineNumbers">{{ $t("common.logViewer.lineNumbers") }}</NCheckbox>
        <NButton size="small" :disabled="!hasEntries" :loading="copying" @click="copy">{{
          $t("common.logViewer.copy")
        }}</NButton>
        <NButton size="small" :disabled="!hasEntries" @click="download">{{ $t("common.logViewer.export") }}</NButton>
        <slot name="toolbar-extra" />
      </div>
    </div>
    <div v-if="error" role="alert" class="px-14px py-8px text-13px text-error bg-theme-fill">{{ error }}</div>
    <LogContent
      v-if="hasEntries"
      ref="content"
      :entries="visible"
      :retained-entries="retained.entries"
      :height="height"
      :wrap="wrap"
      :show-line-numbers="showLineNumbers"
      :follow="follow"
      :label="title ?? $t('common.logViewer.title')"
      @scroll="onScroll"
      @pause="follow = false"
      @anchor-lost="anchorLost = true"
    />
    <div v-else class="flex-center px-14px text-13px text-base-text-3" :style="{ height: `${height}px` }">
      <span v-if="loading">{{ $t("common.logViewer.loading") }}</span>
      <span v-else-if="!error">{{
        $t(retained.entries.length ? "common.logViewer.noMatches" : "common.logViewer.empty")
      }}</span>
    </div>
    <div
      class="flex-y-center flex-wrap justify-between gap-8px px-14px py-8px border-t border-theme-default text-12px text-base-text-3"
    >
      <div class="flex-y-center flex-wrap gap-8px">
        <span>{{ $t("common.logViewer.count", { visible: visible.length, total: retained.entries.length }) }}</span>
        <span v-if="omitted">{{ $t("common.logViewer.truncated", { count: retained.entries.length, omitted }) }}</span>
        <span v-if="anchorLost" role="status">{{ $t("common.logViewer.anchorLost") }}</span>
      </div>
      <span v-if="follow">{{ $t("common.logViewer.following") }}</span>
      <NButton v-else size="tiny" text type="primary" @click="scrollToBottom">
        {{ $t(pending ? "common.logViewer.newEntries" : "common.logViewer.bottom", { count: pending }) }}
      </NButton>
    </div>
    <div
      v-if="feedback"
      :role="feedback === 'copied' ? 'status' : 'alert'"
      class="px-14px pb-8px text-12px"
      :class="feedback === 'copied' ? 'text-success' : 'text-error'"
    >
      {{ $t(`common.logViewer.${feedback}`) }}
    </div>
  </section>
</template>

<style scoped>
  .log-search {
    flex: 1 1 200px;
    min-width: 0;
  }
  .log-level {
    width: 138px;
    max-width: 100%;
  }
</style>

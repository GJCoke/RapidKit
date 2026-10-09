<script setup lang="ts">
  import { onBeforeUpdate, onMounted, onUnmounted, onUpdated, ref, watch } from "vue"
  import type { ScrollbarInst } from "naive-ui"
  import { useResizeObserver } from "@vueuse/core"
  import type { LogEntry } from "./types"

  defineOptions({ name: "LogViewerContent" })
  const props = defineProps<{
    entries: readonly LogEntry[]
    retainedEntries: readonly LogEntry[]
    height: number
    wrap: boolean
    showLineNumbers: boolean
    follow: boolean
    label: string
  }>()
  const emit = defineEmits<{ scroll: [event: Event]; pause: []; anchorLost: [] }>()
  const scrollbar = ref<ScrollbarInst>()
  const content = ref<HTMLElement>()
  let anchor: { key: string; offset: number } | undefined
  let scrollElement: HTMLElement | undefined
  let programmatic = false
  let releaseTimer: ReturnType<typeof setTimeout> | undefined

  function clearGuard() {
    programmatic = false
    clearTimeout(releaseTimer)
  }
  function guardScroll() {
    programmatic = true
    clearTimeout(releaseTimer)
    releaseTimer = setTimeout(clearGuard, 100)
  }
  function moveTo(top: number) {
    if (!scrollbar.value) return
    guardScroll()
    scrollbar.value.scrollTo({ top })
  }
  function scrollToBottom() {
    moveTo(Number.MAX_SAFE_INTEGER)
  }
  function scrollToTop() {
    emit("pause")
    moveTo(0)
  }
  function handleScroll(event: Event) {
    scrollElement = event.target as HTMLElement
    if (!programmatic) emit("scroll", event)
  }
  function handleKey(event: KeyboardEvent) {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) clearGuard()
  }
  onBeforeUpdate(() => {
    anchor = undefined
    // Filtering or eviction may clamp native scrollTop; that is not a user resume.
    if (!props.follow) guardScroll()
    const container = scrollElement
    if (props.follow || !container || !content.value) return
    const top = container.getBoundingClientRect().top
    for (const row of content.value.querySelectorAll<HTMLElement>("[data-log-key]")) {
      if (row.getBoundingClientRect().bottom > top) {
        anchor = { key: row.dataset.logKey!, offset: row.getBoundingClientRect().top - top }
        break
      }
    }
  })
  onUpdated(() => {
    if (props.follow) scrollToBottom()
    else if (anchor) {
      const container = scrollElement
      const row = [...(content.value?.querySelectorAll<HTMLElement>("[data-log-key]") ?? [])].find(
        (element) => element.dataset.logKey === anchor!.key,
      )
      if (row && container)
        moveTo(
          container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset,
        )
      else if (!props.retainedEntries.some((entry) => `${typeof entry.id}:${entry.id}` === anchor!.key))
        emit("anchorLost")
    }
  })
  watch(
    () => props.follow,
    (follow) => {
      if (follow) scrollToBottom()
    },
    { flush: "post" },
  )
  onMounted(() => {
    if (props.follow) scrollToBottom()
  })
  useResizeObserver(content, () => {
    if (props.follow) scrollToBottom()
  })
  onUnmounted(clearGuard)
  defineExpose({ scrollToTop, scrollToBottom })
</script>

<template>
  <NScrollbar
    ref="scrollbar"
    :style="{ height: `${height}px` }"
    :x-scrollable="!wrap"
    @scroll="handleScroll"
    @wheel="clearGuard"
    @pointerdown="clearGuard"
  >
    <div
      ref="content"
      role="log"
      tabindex="0"
      :aria-label="label"
      aria-live="off"
      class="log-content py-12px"
      :class="{ 'no-wrap': !wrap, 'hide-numbers': !showLineNumbers }"
      @touchstart.passive="clearGuard"
      @keydown="handleKey"
    >
      <div v-for="entry in entries" :key="entry.id" :data-log-key="`${typeof entry.id}:${entry.id}`" class="log-line">
        <span v-if="showLineNumbers" class="log-line-number" aria-hidden="true">{{ entry.number }}</span>
        <code class="log-line-text" :class="entry.level ? `level-${entry.level.toLowerCase()}` : ''"
          ><span v-if="entry.timestamp" class="log-timestamp">{{ `${entry.timestamp} ` }}</span
          ><span v-if="entry.level">{{ `[${entry.level}] ` }}</span
          >{{ entry.message }}</code
        >
      </div>
    </div>
  </NScrollbar>
</template>

<style scoped>
  .log-content {
    font-size: 13px;
    line-height: 21px;
  }
  .log-line {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
  }
  .hide-numbers .log-line {
    grid-template-columns: minmax(0, 1fr);
    padding-left: 14px;
  }
  .log-line-number {
    color: var(--lv-muted);
    padding-right: 12px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .log-line-text {
    display: block;
    padding-right: 16px;
    min-height: 21px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
    color: var(--lv-text);
  }
  .log-timestamp {
    color: var(--lv-muted);
  }
  .log-line-text.level-debug {
    color: var(--lv-muted);
  }
  .log-line-text.level-warn {
    color: var(--lv-warning);
  }
  .log-line-text.level-error {
    color: var(--lv-error);
  }
  .no-wrap {
    width: max-content;
    min-width: 100%;
  }
  .no-wrap .log-line {
    grid-template-columns: 52px auto;
  }
  .no-wrap.hide-numbers .log-line {
    grid-template-columns: auto;
  }
  .no-wrap .log-line-text {
    white-space: pre;
    overflow-wrap: normal;
  }
</style>

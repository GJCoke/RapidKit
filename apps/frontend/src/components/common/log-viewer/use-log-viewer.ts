import { computed, ref, watch } from "vue"
import type { Ref } from "vue"
import {
  filterEntries,
  formatEntry,
  normalizeLogs,
  positiveInteger,
  retainEntries,
  structuredAdditions,
} from "./log-utils"
import type { LogLevel, LogViewerProps } from "./types"

export function useLogViewer(props: LogViewerProps, follow: Ref<boolean>) {
  const query = ref("")
  const level = ref<LogLevel | "">("")
  const pending = ref(0)
  const all = computed(() => normalizeLogs(props.log, props.records))
  const retained = computed(() => retainEntries(all.value, props.maxEntries))
  const visible = computed(() =>
    filterEntries(retained.value.entries, query.value, props.records !== undefined ? level.value : ""),
  )
  const displayText = computed(() => visible.value.map(formatEntry).join("\n"))
  const height = computed(() => positiveInteger(props.height, 360))

  watch(
    () => ({
      entries: all.value,
      text: props.records === undefined ? (props.log ?? "") : undefined,
      sourceKey: props.sourceKey,
    }),
    (next, previous) => {
      let additions = null
      if (next.sourceKey === previous.sourceKey && (next.text === undefined) === (previous.text === undefined)) {
        if (next.text !== undefined && previous.text !== undefined) {
          if (next.text.startsWith(previous.text)) additions = next.entries.slice(previous.entries.length)
        } else additions = structuredAdditions(previous.entries, next.entries)
      }
      if (additions === null) {
        follow.value = true
        pending.value = 0
      } else if (!follow.value) {
        // Count only matching new records still within the displayed capacity.
        const retainedIds = new Set(retained.value.entries.map((entry) => entry.id))
        pending.value += filterEntries(
          additions.filter((entry) => retainedIds.has(entry.id)),
          query.value,
          props.records !== undefined ? level.value : "",
        ).length
      }
    },
  )
  watch([query, level, () => props.maxEntries], () => {
    pending.value = 0
  })
  watch(
    follow,
    (value) => {
      if (value) pending.value = 0
    },
    { flush: "sync" },
  )

  function onScroll(event: Event) {
    const element = event.target as HTMLElement
    follow.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 24
  }
  function resume() {
    follow.value = true
    pending.value = 0
  }
  return {
    query,
    level,
    pending,
    retained,
    visible,
    displayText,
    height,
    omitted: computed(() => retained.value.omitted),
    onScroll,
    resume,
  }
}

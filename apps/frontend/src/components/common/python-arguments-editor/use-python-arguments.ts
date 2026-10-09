import { computed, ref, toRaw, watch } from "vue"
import type { Ref } from "vue"
import { ArgumentError, decodeArguments, encodeArguments } from "./arguments"
import type { ArgumentRow, KeywordRow, PythonArguments } from "./arguments"

export function usePythonArguments(model: Ref<PythonArguments>) {
  const args = ref<ArgumentRow[]>([])
  const kwargs = ref<KeywordRow[]>([])
  let emitted: PythonArguments | undefined
  let synchronizing = false
  watch(
    model,
    (value) => {
      if (toRaw(value) === emitted) return
      const rows = decodeArguments(value)
      synchronizing = true
      args.value = rows.args
      kwargs.value = rows.kwargs
      synchronizing = false
    },
    { immediate: true, deep: true, flush: "sync" },
  )
  const result = computed(() => {
    try {
      return { value: encodeArguments(args.value, kwargs.value), error: "", group: undefined, index: undefined }
    } catch (error) {
      return {
        value: null,
        error: error instanceof ArgumentError ? error.code : "json",
        group: error instanceof ArgumentError ? error.group : undefined,
        index: error instanceof ArgumentError ? error.index : undefined,
      }
    }
  })
  function commit() {
    if (!result.value.value) return false
    emitted = result.value.value
    model.value = result.value.value
    return true
  }
  watch(
    result,
    () => {
      if (!synchronizing) commit()
    },
    { flush: "sync" },
  )
  function move(index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= args.value.length) return
    const rows = [...args.value]
    ;[rows[index], rows[target]] = [rows[target]!, rows[index]!]
    args.value = rows
  }
  return { args, kwargs, result, commit, move }
}

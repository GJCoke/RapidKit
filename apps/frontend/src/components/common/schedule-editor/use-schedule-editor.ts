import { ref, toRaw, watch } from "vue"
import type { Ref } from "vue"
import { defaultSchedule } from "./schedule"
import type { ScheduleType, ScheduleValue } from "./schedule"

export function useScheduleEditor(model: Ref<ScheduleValue>) {
  const kind = ref(model.value.type)
  const session = ref(0)
  let emitted: ScheduleValue | null = null
  const drafts = ref(createDrafts())
  drafts.value[model.value.type] = model.value
  function createDrafts() {
    return {
      interval: defaultSchedule("interval"),
      crontab: defaultSchedule("crontab"),
      solar: defaultSchedule("solar"),
    }
  }
  function select(type: ScheduleType) {
    if (type === kind.value) return
    kind.value = type
    emitted = toRaw(drafts.value[type])
    model.value = emitted
  }
  function update(type: ScheduleType, value: ScheduleValue) {
    drafts.value[type] = value
    if (type === kind.value) {
      emitted = toRaw(value)
      model.value = emitted
    }
  }
  watch(
    model,
    (value) => {
      if (toRaw(value) === emitted) return
      // A new external object starts a new edit session; nested edits belong to the current draft.
      kind.value = value.type
      drafts.value = createDrafts()
      drafts.value[value.type] = value
      session.value++
      emitted = toRaw(value)
    },
    { flush: "sync" },
  )
  return { kind, session, drafts, select, update }
}

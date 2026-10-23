import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { readTaskView, writeTaskView, type TaskViewState } from "./task-view-state"
/** Applied filters live in React Router; only unapplied inputs are local state. */
export function useTaskView() {
  const [query, setQuery] = useSearchParams(),
    identity = query.toString()
  const state = useMemo(() => readTaskView(new URLSearchParams(identity)), [identity])
  const [draft, setDraft] = useState(state),
    [observed, setObserved] = useState(identity)
  const ownQuery = useRef(identity)
  if (observed !== identity) {
    setObserved(identity)
    // Our own paging/drill/refresh keeps draft edits. External history replaces them.
    if (ownQuery.current !== identity) setDraft(state)
  }
  useEffect(() => {
    const canonical = writeTaskView(state, new URLSearchParams(identity)).toString()
    if (canonical !== identity) {
      ownQuery.current = canonical
      setQuery(canonical, { replace: true })
    }
  }, [state, identity, setQuery])
  function update(next: TaskViewState) {
    const canonical = writeTaskView(next, query).toString()
    ownQuery.current = canonical
    setQuery(canonical, { replace: true })
  }
  return { state, draft, setDraft, update }
}

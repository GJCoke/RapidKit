import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useQuery, type QueryKey } from "@tanstack/react-query"
import type { SchedulePreview, ScheduleValue } from "@/services/api/schedule"
import { encodeSchedule, type ScheduleDraft } from "./schedule-model"
export type PreviewLoader = (value: ScheduleValue) => Promise<SchedulePreview | null>
/** Each edit owns a fresh generation, including A→B→A. Query observes only that generation. */
export function useSchedulePreview(draft: ScheduleDraft, loadPreview: PreviewLoader, scope: QueryKey) {
  const fingerprint = JSON.stringify([scope, draft]),
    [frame, setFrame] = useState({ fingerprint, generation: 0 })
  let generation = frame.generation
  if (frame.fingerprint !== fingerprint) {
    generation++
    setFrame({ fingerprint, generation })
  }
  const encoded = encodeSchedule(draft),
    localValid = encoded.value !== null,
    [ready, setReady] = useState(-1),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    alive = useRef(true),
    current = useRef({ fingerprint, generation })
  useLayoutEffect(() => {
    current.current = { fingerprint, generation }
  }, [fingerprint, generation])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    clearTimeout(timer.current)
    if (localValid) timer.current = setTimeout(() => setReady(generation), 300)
    return () => clearTimeout(timer.current)
  }, [generation, localValid])
  const query = useQuery({
    queryKey: [...scope, "preview", generation, fingerprint],
    enabled: localValid && ready === generation,
    queryFn: async () => {
      if (!encoded.value) throw new Error("Invalid local schedule")
      const result = await loadPreview(encoded.value)
      if (!result) throw new Error("Schedule preview unavailable")
      return { ...result, nextRuns: result.nextRuns ?? [] }
    },
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  async function refresh() {
    if (
      !alive.current ||
      !localValid ||
      current.current.fingerprint !== fingerprint ||
      current.current.generation !== generation
    )
      return false
    clearTimeout(timer.current)
    try {
      const result = await query.refetch({ cancelRefetch: false })
      return (
        alive.current &&
        current.current.fingerprint === fingerprint &&
        current.current.generation === generation &&
        result.status === "success" &&
        Boolean(result.data?.valid)
      )
    } catch {
      return false
    }
  }
  return {
    preview: query.data,
    loading: query.isFetching,
    failed: query.isError,
    invalid: !localValid,
    error: encoded.error,
    refresh,
    validate: refresh,
  }
}

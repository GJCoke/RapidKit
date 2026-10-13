import { computed, ref } from "vue"
import { defineStore } from "pinia"
import { fetchGetTopBanner } from "@/service/api"

/** One authenticated session, independent of inbox/read state. */
export const useBannerStore = defineStore("global-banner", () => {
  const snapshot = ref<Api.Notification.TopBanner | null>(null)
  const clock = ref(Date.now())
  const loading = ref(false)
  let session = ""
  let epoch = 0
  let requestId = 0
  const expectedRevision = ref(0)
  let ticker: ReturnType<typeof setInterval> | undefined
  let boundary: ReturnType<typeof setTimeout> | undefined
  let calibrated = false
  let serverAnchor = Date.now()
  let monotonicAnchor = performance.now()
  function now() {
    return serverAnchor + performance.now() - monotonicAnchor
  }
  const current = computed(() => {
    const item = snapshot.value?.current
    if (!item || (snapshot.value?.revision ?? 0) < expectedRevision.value) return null
    if (snapshot.value?.nextChangeAt && Date.parse(snapshot.value.nextChangeAt) <= clock.value) return null
    const start = item.publishAt ?? item.publishedAt
    if (start && Date.parse(start) > clock.value) return null
    if (item.expireAt && Date.parse(item.expireAt) <= clock.value) return null
    return item
  })
  function scheduleBoundary() {
    clearTimeout(boundary)
    const time = snapshot.value?.nextChangeAt
    if (!time) return
    const delay = Date.parse(time) - now()
    if (!Number.isFinite(delay)) return
    boundary = setTimeout(
      () => {
        clock.value = now()
        void refresh()
      },
      Math.min(2_147_483_647, Math.max(50, delay + 10)),
    )
  }
  async function refresh() {
    if (!session) return
    const currentEpoch = epoch
    const request = ++requestId
    const sentAt = performance.now()
    loading.value = true
    try {
      const { data, error } = await fetchGetTopBanner()
      if (currentEpoch !== epoch || request !== requestId || error || !data || data.revision < expectedRevision.value)
        return
      snapshot.value = data
      const receivedAt = performance.now()
      const estimate = Date.parse(data.serverNow) + Math.max(0, receivedAt - sentAt) / 2
      serverAnchor = calibrated ? Math.max(now(), estimate) : estimate
      monotonicAnchor = receivedAt
      calibrated = true
      clock.value = now()
      expectedRevision.value = data.revision
      scheduleBoundary()
    } finally {
      if (currentEpoch === epoch && request === requestId) loading.value = false
    }
  }
  function onFocus() {
    clock.value = now()
    void refresh()
  }
  function onVisibility() {
    if (document.visibilityState === "visible") onFocus()
  }
  function reset() {
    epoch++
    session = ""
    snapshot.value = null
    loading.value = false
    expectedRevision.value = 0
    calibrated = false
    clearInterval(ticker)
    clearTimeout(boundary)
    if (typeof window !== "undefined") window.removeEventListener("focus", onFocus)
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility)
  }
  function start(token: string) {
    if (!token || token === session) return
    reset()
    session = token
    serverAnchor = Date.now()
    monotonicAnchor = performance.now()
    void refresh()
    ticker = setInterval(() => {
      clock.value = now()
    }, 1_000)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
  }
  function invalidate(revision: number) {
    expectedRevision.value = Math.max(expectedRevision.value, revision)
    void refresh()
  }
  return { snapshot, current, loading, refresh, start, reset, invalidate }
})

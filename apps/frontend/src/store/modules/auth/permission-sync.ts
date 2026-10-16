/** Payload of the backend `permission:changed` socket event */
export interface PermissionChangedPayload {
  scope: "roles" | "user" | "menu"
  roles?: string[]
  revision: number
}

export interface PermissionSyncUser {
  isAdmin: boolean
  roles: string[]
}

export interface PermissionSyncOptions {
  getUser: () => PermissionSyncUser
  refresh: () => Promise<void>
  /** Upper bound of the random delay used to spread refreshes across clients */
  maxDelay?: number
  /** Minimum interval between fallback triggers (reconnect / 34001) */
  fallbackInterval?: number
  random?: () => number
  now?: () => number
}

export interface PermissionSync {
  signal: (payload: PermissionChangedPayload) => void
  trigger: () => void
  reset: () => void
}

/** Whether a permission change affects the current user */
export function isRelevantPermissionChange(payload: PermissionChangedPayload, user: PermissionSyncUser) {
  if (payload.scope === "menu") return true
  if (user.isAdmin) return false
  if (payload.scope === "user") return true
  return (payload.roles ?? []).some((code) => user.roles.includes(code))
}

/**
 * Decide when to refresh permissions: filter, dedupe, spread, and coalesce so at most one refresh runs at a time.
 */
export function createPermissionSync(options: PermissionSyncOptions): PermissionSync {
  const { getUser, refresh, maxDelay = 3000, fallbackInterval = 10_000, random = Math.random, now = Date.now } = options

  let lastRevision = 0
  let lastFallbackAt = Number.NEGATIVE_INFINITY
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let dirty = false
  let generation = 0

  async function run() {
    timer = null
    running = true
    dirty = false
    const current = generation

    try {
      await refresh()
    } catch (error) {
      console.error("[permission-sync] refresh failed", error)
    }

    if (current !== generation) return
    running = false
    if (dirty) void run()
  }

  function signal(payload: PermissionChangedPayload) {
    // Relevance first: revisions are server ms timestamps, so an unrelated change in the same ms must not mask ours
    if (!isRelevantPermissionChange(payload, getUser())) return
    if (payload.revision <= lastRevision) return
    lastRevision = payload.revision

    if (running) {
      dirty = true
      return
    }
    if (timer) return

    timer = setTimeout(() => void run(), Math.floor(random() * maxDelay))
  }

  function trigger() {
    const at = now()
    if (at - lastFallbackAt < fallbackInterval) return
    lastFallbackAt = at

    if (running) {
      dirty = true
      return
    }
    if (timer) clearTimeout(timer)
    void run()
  }

  function reset() {
    generation += 1
    if (timer) clearTimeout(timer)
    timer = null
    running = false
    dirty = false
    lastRevision = 0
    lastFallbackAt = Number.NEGATIVE_INFINITY
  }

  return { signal, trigger, reset }
}

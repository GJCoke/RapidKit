import { createLogger } from "@/utils/logger"
import { diagnosticGeneration, recordDiagnosticEvent, type DiagnosticEventInput } from "@/utils/diagnostics"

const logger = createLogger("permission-sync")

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
  trigger: (source?: "socket_reconnect" | "permission_denied" | "manual") => void
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
  let source: DiagnosticEventInput["source"] = "manual"
  let owner = diagnosticGeneration()
  const suppressed = new Map<string, number>()
  function skip(reason_code: string, from: DiagnosticEventInput["source"]) {
    const count = Math.min((suppressed.get(reason_code) || 0) + 1, 1000)
    suppressed.set(reason_code, count)
    recordDiagnosticEvent({
      category: "permission",
      operation: "permission.sync",
      phase: "skipped",
      source: from,
      reason_code,
      observation_count: count,
    })
  }

  async function run() {
    timer = null
    if (owner !== diagnosticGeneration()) return
    running = true
    dirty = false
    const current = generation
    const diagnosticOwner = owner
    const from = source
    const started = performance.now()
    const record = (phase: "start" | "success" | "failure", reason_code?: string) => {
      if (current === generation)
        recordDiagnosticEvent(
          {
            category: "permission",
            operation: "permission.sync",
            phase,
            source: from,
            reason_code,
            duration_ms: Math.round(performance.now() - started),
          },
          diagnosticOwner,
        )
    }

    try {
      record("start")
      logger.debug("Permission refresh started")
      await refresh()
      record("success")
      if (current === generation && diagnosticOwner === diagnosticGeneration())
        logger.info("Permission refresh completed")
    } catch {
      record("failure", "refresh_failed")
      if (current === generation && diagnosticOwner === diagnosticGeneration())
        logger.error("Permission refresh failed", { reason_code: "refresh_failed" })
    }

    if (current !== generation) return
    running = false
    if (dirty) void run()
  }

  function signal(payload: PermissionChangedPayload) {
    // Relevance first: revisions are server ms timestamps, so an unrelated change in the same ms must not mask ours
    if (!isRelevantPermissionChange(payload, getUser())) {
      skip("irrelevant", "server_signal")
      return
    }
    if (payload.revision <= lastRevision) {
      skip("stale_revision", "server_signal")
      return
    }
    lastRevision = payload.revision
    logger.debug("Permission sync requested", { source: "server_signal" })
    source = "server_signal"
    owner = diagnosticGeneration()

    if (running) {
      dirty = true
      skip("coalesced", source)
      return
    }
    if (timer) {
      skip("coalesced", source)
      return
    }

    timer = setTimeout(() => void run(), Math.floor(random() * maxDelay))
  }

  function trigger(from: "socket_reconnect" | "permission_denied" | "manual" = "manual") {
    const at = now()
    if (at - lastFallbackAt < fallbackInterval) {
      skip("throttled", from)
      return
    }
    lastFallbackAt = at
    source = from
    owner = diagnosticGeneration()
    logger.debug("Permission sync requested", { source })

    if (running) {
      dirty = true
      skip("coalesced", source)
      return
    }
    if (timer) clearTimeout(timer)
    void run()
  }

  function reset() {
    if (running || timer)
      recordDiagnosticEvent(
        { category: "permission", operation: "permission.sync", phase: "cancelled", source, reason_code: "reset" },
        owner,
      )
    generation += 1
    if (timer) clearTimeout(timer)
    timer = null
    running = false
    dirty = false
    lastRevision = 0
    lastFallbackAt = Number.NEGATIVE_INFINITY
    suppressed.clear()
  }

  return { signal, trigger, reset }
}

import { createLogger } from "@/utils/logger"
import { diagnosticGeneration, recordDiagnosticEvent, type DiagnosticEventInput } from "@/utils/diagnostics"

const logger = createLogger("permission-refresh")

export interface PermissionRefresherOptions<S> {
  /** Fetch the latest permission snapshot without applying it; resolve `null` on failure */
  fetchLatest: () => Promise<S | null>
  /** Whether the current route is still accessible under the snapshot */
  canAccessCurrent: (snapshot: S) => boolean
  /** Apply the snapshot; `leave` means the current page must be left */
  apply: (snapshot: S, leave: boolean) => Promise<void>
  /** Ask the user to confirm leaving the current page */
  confirm: (onConfirm: () => void) => void
  retryDelay?: number
}

export interface PermissionRefresher {
  refresh: () => Promise<void>
  reset: () => void
}

/**
 * Fetch → decide → apply. Losing access to the current page waits for user confirmation, and newer snapshots fetched
 * while the dialog is open replace the pending one.
 */
export function createPermissionRefresher<S>(options: PermissionRefresherOptions<S>): PermissionRefresher {
  const { fetchLatest, canAccessCurrent, apply, confirm, retryDelay = 5000 } = options

  let pending: S | null = null
  let dialogOpen = false
  let generation = 0

  function record(owner: number, diagnosticOwner: number, fields: Omit<DiagnosticEventInput, "category">) {
    if (owner === generation) recordDiagnosticEvent({ category: "permission", ...fields }, diagnosticOwner)
  }

  async function fetchWithRetry(owner: number, diagnosticOwner: number) {
    record(owner, diagnosticOwner, { operation: "permission.fetch", phase: "start", attempt: 1 })
    let attempt = 1
    try {
      const first = await fetchLatest()
      if (owner !== generation) return null
      if (first) {
        record(owner, diagnosticOwner, { operation: "permission.fetch", phase: "success", attempt })
        return first
      }
      attempt = 2
      record(owner, diagnosticOwner, { operation: "permission.fetch", phase: "retrying", attempt })
      logger.debug("Permission refresh retry scheduled")
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      if (owner !== generation) return null
      const second = await fetchLatest()
      record(owner, diagnosticOwner, {
        operation: "permission.fetch",
        phase: second ? "success" : "failure",
        reason_code: second ? undefined : "no_snapshot",
        attempt,
      })
      return second
    } catch (error) {
      record(owner, diagnosticOwner, {
        operation: "permission.fetch",
        phase: "failure",
        reason_code: "fetch_failed",
        attempt,
      })
      throw error
    }
  }

  async function applySnapshot(snapshot: S, leave: boolean, owner: number, diagnosticOwner: number) {
    const started = performance.now()
    const reason_code = leave ? "route_leave" : "access_retained"
    record(owner, diagnosticOwner, { operation: "permission.apply", phase: "start", reason_code })
    try {
      await apply(snapshot, leave)
      record(owner, diagnosticOwner, {
        operation: "permission.apply",
        phase: "success",
        reason_code,
        duration_ms: Math.round(performance.now() - started),
      })
      if (owner === generation && diagnosticOwner === diagnosticGeneration())
        logger.info("Permissions applied", { reason_code })
    } catch (error) {
      record(owner, diagnosticOwner, {
        operation: "permission.apply",
        phase: "failure",
        reason_code: "apply_failed",
        duration_ms: Math.round(performance.now() - started),
      })
      throw error
    }
  }

  async function refresh() {
    logger.debug("Permission snapshot requested")
    const owner = generation
    const diagnosticOwner = diagnosticGeneration()
    const snapshot = await fetchWithRetry(owner, diagnosticOwner)
    if (!snapshot || owner !== generation) return

    if (dialogOpen) {
      pending = snapshot
      return
    }

    if (canAccessCurrent(snapshot)) {
      await applySnapshot(snapshot, false, owner, diagnosticOwner)
      return
    }

    pending = snapshot
    dialogOpen = true
    record(owner, diagnosticOwner, {
      operation: "permission.apply",
      phase: "pending",
      reason_code: "confirmation_required",
    })
    confirm(() => {
      if (owner !== generation || !pending) return
      const latest = pending
      pending = null
      dialogOpen = false
      applySnapshot(latest, !canAccessCurrent(latest), owner, diagnosticOwner).catch(() => {
        if (owner === generation && diagnosticOwner === diagnosticGeneration())
          logger.error("Permission apply failed", { reason_code: "apply_failed" })
      })
    })
  }

  function reset() {
    generation += 1
    pending = null
    dialogOpen = false
  }

  return { refresh, reset }
}

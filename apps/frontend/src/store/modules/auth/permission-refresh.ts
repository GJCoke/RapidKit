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

  async function fetchWithRetry(owner: number) {
    const first = await fetchLatest()
    if (first || owner !== generation) return first

    await new Promise((resolve) => setTimeout(resolve, retryDelay))
    if (owner !== generation) return null
    return fetchLatest()
  }

  async function refresh() {
    const owner = generation
    const snapshot = await fetchWithRetry(owner)
    if (!snapshot || owner !== generation) return

    if (dialogOpen) {
      pending = snapshot
      return
    }

    if (canAccessCurrent(snapshot)) {
      await apply(snapshot, false)
      return
    }

    pending = snapshot
    dialogOpen = true
    confirm(() => {
      if (owner !== generation || !pending) return
      const latest = pending
      pending = null
      dialogOpen = false
      apply(latest, !canAccessCurrent(latest)).catch((error) => {
        console.error("[permission-refresh] apply failed", error)
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

import NProgress from "nprogress"

export interface ProgressAdapter {
  start: () => unknown
  done: () => unknown
}

interface ProgressScheduler {
  schedule: (callback: () => void) => number
  cancel: (id: number) => void
}

const frameScheduler: ProgressScheduler = {
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}

export function createNavigationProgressController(
  progress: ProgressAdapter,
  scheduler: ProgressScheduler = frameScheduler,
) {
  const activeSources = new Set<string>()
  let pendingCompletion: number | null = null
  let running = false

  function set(source: string, active: boolean) {
    if (active) {
      activeSources.add(source)

      if (pendingCompletion !== null) {
        scheduler.cancel(pendingCompletion)
        pendingCompletion = null
      }

      if (!running) {
        running = true
        progress.start()
      }
      return
    }

    activeSources.delete(source)
    if (activeSources.size > 0 || !running || pendingCompletion !== null) return

    const completion = scheduler.schedule(() => {
      if (pendingCompletion !== completion) return
      pendingCompletion = null

      if (activeSources.size === 0 && running) {
        running = false
        progress.done()
      }
    })
    pendingCompletion = completion
  }

  return { set }
}

NProgress.configure({ easing: "ease", speed: 500 })

export const navigationProgressController = createNavigationProgressController(NProgress)

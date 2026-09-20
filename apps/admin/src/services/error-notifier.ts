import type { NormalizedRequestError } from "./request-error"

interface ErrorNotifierOptions {
  notify: (message: string) => void
  now?: () => number
  cooldownMs?: number
}

export function createErrorNotifier({ notify, now = Date.now, cooldownMs = 5_000 }: ErrorNotifierOptions) {
  const shownAt = new Map<string, number>()

  return {
    show(error: NormalizedRequestError) {
      const key = `${error.kind}:${error.code}:${error.message}`
      const currentTime = now()
      const previousTime = shownAt.get(key)

      if (previousTime !== undefined && currentTime - previousTime <= cooldownMs) return false

      shownAt.set(key, currentTime)
      notify(error.message)
      return true
    },
  }
}

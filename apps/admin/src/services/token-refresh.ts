export function createTokenRefreshCoordinator(refreshToken: () => Promise<boolean>) {
  let inFlight: Promise<boolean> | null = null

  return {
    refresh() {
      if (!inFlight) {
        inFlight = refreshToken().finally(() => {
          inFlight = null
        })
      }

      return inFlight
    },
  }
}

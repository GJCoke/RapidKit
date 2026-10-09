export function createTokenRefreshCoordinator(refreshToken: () => Promise<boolean>) {
  const inFlight = new Map<number, Promise<boolean>>()

  return {
    refresh(session = 0) {
      let promise = inFlight.get(session)
      if (!promise) {
        promise = refreshToken().finally(() => {
          inFlight.delete(session)
        })
        inFlight.set(session, promise)
      }
      return promise
    },
  }
}

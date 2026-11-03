export interface RequestInstanceState {
  /** the promise of refreshing token */
  refreshTokenPromise: Promise<boolean> | null
  refreshTokenSession?: number
  refreshTokenWaiters?: number
  /** the request error message stack */
  errMsgStack: string[]
  [key: string]: unknown
}

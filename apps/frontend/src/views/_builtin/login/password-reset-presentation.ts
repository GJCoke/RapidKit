export function getResetRequestState(submitted: boolean, seconds: number) {
  return {
    submitted,
    canSubmit: seconds <= 0,
    seconds: Math.max(0, seconds),
  }
}

export function formatCooldown(seconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const paddedMinutes = String(minutes).padStart(2, "0")
  const paddedSeconds = String(remainingSeconds).padStart(2, "0")

  return hours > 0 ? `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`
}

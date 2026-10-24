import { useCallback, useEffect, useState } from "react"

export function useCooldown() {
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now)
  const start = useCallback((seconds: number) => {
    const time = Date.now()
    setNow(time)
    setDeadline(time + Math.max(0, seconds) * 1000)
  }, [])
  useEffect(() => {
    if (!deadline) return
    const update = () => {
      const time = Date.now()
      setNow(time)
      if (time >= deadline) setDeadline(0)
    }
    const timer = window.setInterval(update, 1000)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [deadline])
  return { seconds: Math.max(0, Math.ceil((deadline - now) / 1000)), start }
}

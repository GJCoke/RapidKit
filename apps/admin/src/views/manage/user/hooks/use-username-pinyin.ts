import { useEffect, useRef, useState } from "react"
import { validateUsernamePinyin } from "@/services/api/user"

export function useUsernamePinyin(
  name: string,
  username: string,
  setUsername: (value: string) => void,
  enabled: boolean,
) {
  const [checking, setChecking] = useState(false)
  const edited = useRef(Boolean(username))
  const request = useRef(0)
  useEffect(() => {
    if (!enabled || name.trim().length < 2) {
      if (!name.trim()) edited.current = false
      return
    }
    const id = ++request.current
    const timer = setTimeout(async () => {
      setChecking(true)
      const result = await validateUsernamePinyin({ name, username })
      if (id === request.current && !result.error && result.data && !edited.current && result.data.suggestedUsername)
        setUsername(result.data.suggestedUsername)
      if (id === request.current) setChecking(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [enabled, name, setUsername, username])
  return {
    checking,
    markEdited: () => {
      edited.current = true
    },
    reset: () => {
      edited.current = false
    },
  }
}

import { useCallback, useEffect, useRef, useState } from "react"
import { usePermission } from "@/features/auth/permissions"
import { validateUsernamePinyin, type UsernamePinyinResult } from "@/services/api/user"
import { getAuthSession } from "@/services/auth-session"
import { requireDirectoryPermission } from "@/services/user-access"
import { useAuthStore } from "@/stores/auth"

interface PinyinValidationState {
  checking: boolean
  suggestedUsername: string
  consistent: boolean | null
  failed: boolean
}
const emptyValidation: PinyinValidationState = {
  checking: false,
  suggestedUsername: "",
  consistent: null,
  failed: false,
}
export function useUsernamePinyin(
  name: string,
  username: string,
  setUsername: (value: string) => void,
  enabled: boolean,
  mode: "add" | "edit" = "add",
) {
  const token = useAuthStore((state) => state.token)
  const session = useRef(getAuthSession()).current
  const allowed = usePermission("user:validate-name") && Boolean(token) && session === getAuthSession()
  const [validation, setValidation] = useState(emptyValidation)
  const edited = useRef(Boolean(username))
  const request = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ name, username, enabled, mode, allowed })
  latest.current = { name, username, enabled, mode, allowed }
  const check = useCallback(
    async (allowAutofill: boolean): Promise<UsernamePinyinResult | null> => {
      const values = latest.current
      if (!values.enabled || !values.allowed || values.name.trim().length < 2) return null
      const ticket = ++request.current
      const current = () => {
        const input = latest.current
        return (
          ticket === request.current &&
          input.enabled &&
          input.allowed &&
          input.name === values.name &&
          input.username === values.username &&
          input.mode === values.mode &&
          session === getAuthSession()
        )
      }
      try {
        requireDirectoryPermission("user:validate-name", session)
        setValidation((previous) => ({ ...previous, checking: true, failed: false }))
        const result = await validateUsernamePinyin({ name: values.name, username: values.username })
        if (!current()) return null
        requireDirectoryPermission("user:validate-name", session)
        if (result.error || !result.data) throw result.error ?? new Error("Pinyin validation response is empty")
        const data = result.data
        const autofill = allowAutofill && values.mode === "add" && !edited.current && Boolean(data.suggestedUsername)
        setValidation({
          checking: false,
          failed: false,
          suggestedUsername: data.suggestedUsername,
          consistent: autofill ? true : data.consistent,
        })
        if (autofill && data.suggestedUsername !== values.username) setUsername(data.suggestedUsername)
        return data
      } catch {
        if (current()) setValidation({ ...emptyValidation, failed: true })
        return null
      }
    },
    [session, setUsername],
  )
  useEffect(() => {
    request.current++
    clearTimeout(timer.current)
    setValidation(emptyValidation)
    if (enabled && allowed && name.trim().length >= 2)
      timer.current = setTimeout(() => {
        timer.current = undefined
        void check(true)
      }, 300)
    return () => {
      request.current++
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [enabled, allowed, name, username, mode, check])
  return {
    ...(allowed && enabled ? validation : emptyValidation),
    markEdited() {
      edited.current = true
      request.current++
      setValidation(emptyValidation)
    },
    reset() {
      edited.current = false
      request.current++
      clearTimeout(timer.current)
      setValidation(emptyValidation)
    },
    validateNow() {
      clearTimeout(timer.current)
      timer.current = undefined
      return check(false)
    },
  }
}

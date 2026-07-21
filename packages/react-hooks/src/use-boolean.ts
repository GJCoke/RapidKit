import { useCallback, useState } from "react"

export function useBoolean(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const setTrue = useCallback(() => setValue(true), [])
  const setFalse = useCallback(() => setValue(false), [])
  const toggle = useCallback(() => setValue((v) => !v), [])

  return { value, setValue, setTrue, setFalse, toggle }
}

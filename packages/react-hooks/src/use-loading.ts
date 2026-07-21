import { useBoolean } from "./use-boolean"

export function useLoading(initialLoading = false) {
  const { value: loading, setTrue: startLoading, setFalse: endLoading } = useBoolean(initialLoading)

  return { loading, startLoading, endLoading }
}

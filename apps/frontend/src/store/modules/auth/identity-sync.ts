export function installIdentitySync(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  prefix: string,
  reload: () => void,
) {
  const keys = new Set([`${prefix}token`, `${prefix}impersonation`])
  let timer: ReturnType<typeof setTimeout> | null = null
  const listener = (raw: Event) => {
    const event = raw as StorageEvent
    const storage = typeof window === "undefined" ? undefined : window.localStorage
    if (event.storageArea && event.storageArea !== storage) return
    if (event.key !== null && !keys.has(event.key)) return
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      reload()
    }, 0)
  }
  target.addEventListener("storage", listener)
  return () => {
    target.removeEventListener("storage", listener)
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
}

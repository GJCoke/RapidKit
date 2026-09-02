import { useEffect } from "react"
import { useAppStore } from "@/stores/app"

export function useMobileWatch() {
  const setIsMobile = useAppStore((s) => s.setIsMobile)
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)")
    const apply = () => setIsMobile(mql.matches)
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [setIsMobile])
}

import { getAuthSession } from "@/service/request/auth-session"
import { getDiagnosticPackage } from "./diagnostics"

export function downloadDiagnosticPackage(): boolean {
  let url: string | undefined
  let link: HTMLAnchorElement | undefined
  try {
    getAuthSession()
    const content = JSON.stringify(getDiagnosticPackage(), null, 0)
    url = URL.createObjectURL(new Blob([content], { type: "application/json" }))
    link = document.createElement("a")
    link.href = url
    link.download = `rapidkit-diagnostics-${Date.now()}.json`
    document.body.append(link)
    link.click()
    return true
  } catch {
    return false
  } finally {
    link?.remove()
    if (url) {
      const objectUrl = url
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }
  }
}

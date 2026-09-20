import { useEffect, useState } from "react"
import { Maximize, Minimize } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { DropdownMenuItem } from "@rapidkit/ui/components/dropdown-menu"
import { toast } from "@rapidkit/ui/components/sonner"

export interface FullscreenAdapter {
  getElement(): Element | null
  request(element: HTMLElement): Promise<void>
  exit(): Promise<void>
  subscribe(listener: () => void): () => void
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error("Fullscreen API is unavailable"))
}

export const browserFullscreenAdapter: FullscreenAdapter = {
  getElement: () => (typeof document === "undefined" ? null : (document.fullscreenElement ?? null)),
  request: (element) => {
    if (typeof element.requestFullscreen !== "function") return unavailable()
    return element.requestFullscreen()
  },
  exit: () => {
    if (typeof document === "undefined" || typeof document.exitFullscreen !== "function") return unavailable()
    return document.exitFullscreen()
  },
  subscribe: (listener) => {
    if (typeof document === "undefined") return () => undefined
    document.addEventListener("fullscreenchange", listener)
    return () => document.removeEventListener("fullscreenchange", listener)
  },
}

export function BrowserFullscreen({
  adapter = browserFullscreenAdapter,
  enterLabel = "Enter browser fullscreen",
  exitLabel = "Exit browser fullscreen",
  errorMessage = "Browser fullscreen is unavailable",
  menuItem = false,
}: {
  adapter?: FullscreenAdapter
  enterLabel?: string
  exitLabel?: string
  errorMessage?: string
  menuItem?: boolean
}) {
  const [fullscreenElement, setFullscreenElement] = useState<Element | null>(() => adapter.getElement())
  const isFullscreen = fullscreenElement !== null
  const label = isFullscreen ? exitLabel : enterLabel

  const syncFullscreenState = () => setFullscreenElement(adapter.getElement())

  useEffect(() => {
    syncFullscreenState()
    return adapter.subscribe(syncFullscreenState)
  }, [adapter])

  const toggleFullscreen = async () => {
    try {
      if (adapter.getElement()) await adapter.exit()
      else {
        if (typeof document === "undefined") throw new Error("Fullscreen API is unavailable")
        await adapter.request(document.documentElement)
      }
    } catch {
      toast.error(errorMessage)
    } finally {
      syncFullscreenState()
    }
  }

  if (menuItem) {
    return (
      <DropdownMenuItem onClick={() => void toggleFullscreen()}>
        {isFullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        {label}
      </DropdownMenuItem>
    )
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={() => void toggleFullscreen()}>
      {isFullscreen ? (
        <Minimize className="size-4" aria-hidden="true" />
      ) : (
        <Maximize className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}

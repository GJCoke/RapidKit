import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ErrorState, LoadingState } from "@/features/layout/components/states"
import { parseSafeExternalUrl } from "./route-url"

export function resolveIframeSource(src?: string): string | null {
  return parseSafeExternalUrl(src)?.href ?? null
}

export function IframeRoute({ src, title, timeoutMs = 15_000 }: { src?: string; title: string; timeoutMs?: number }) {
  const { t } = useTranslation()
  const safeSrc = resolveIframeSource(src)
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<"loading" | "ready" | "error">(safeSrc ? "loading" : "error")

  useEffect(() => {
    if (!safeSrc || state !== "loading") return
    const timer = window.setTimeout(() => setState("error"), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [generation, safeSrc, state, timeoutMs])

  const retry = () => {
    setState(safeSrc ? "loading" : "error")
    setGeneration((value) => value + 1)
  }

  if (!safeSrc || state === "error") {
    return <ErrorState message={t("error.iframe")} onRetry={safeSrc ? retry : undefined} />
  }

  return (
    <div className="relative h-full min-h-96">
      {state === "loading" && <LoadingState label={t("state.loading")} />}
      <iframe
        key={generation}
        className={state === "ready" ? "h-full min-h-96 w-full border-0" : "invisible absolute size-0"}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        src={safeSrc}
        title={title}
        onError={() => setState("error")}
        onLoad={() => setState("ready")}
      />
    </div>
  )
}

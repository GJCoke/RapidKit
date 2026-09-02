import { Loader2 } from "lucide-react"

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

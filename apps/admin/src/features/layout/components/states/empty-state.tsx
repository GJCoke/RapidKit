import type { ReactNode } from "react"
import { Inbox } from "lucide-react"

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Inbox className="size-8 opacity-60" />
      <p className="text-sm">{message}</p>
      {action}
    </div>
  )
}

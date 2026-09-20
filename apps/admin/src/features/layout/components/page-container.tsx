import type { ReactNode } from "react"
import { cn } from "@rapidkit/ui/lib/utils"

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-page-container className={cn("mx-auto h-full w-full", className)}>
      {children}
    </div>
  )
}

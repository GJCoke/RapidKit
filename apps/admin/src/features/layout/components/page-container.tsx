import type { ReactNode } from "react"
import { cn } from "@rapidkit/ui/lib/utils"

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-full p-4", className)}>{children}</div>
}

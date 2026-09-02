import type { LucideIcon } from "lucide-react"
import { Card } from "@rapidkit/ui/components/card"
import { cn } from "@rapidkit/ui/lib/utils"

interface Stat {
  label: string
  value: string
  delta?: string
  deltaTone?: "success" | "destructive"
  icon: LucideIcon
  tone: "success" | "warning" | "info" | "destructive"
}

const TONE_CHIP: Record<Stat["tone"], string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{s.label}</span>
            <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE_CHIP[s.tone])}>
              <s.icon className="size-5" />
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold tabular-nums">{s.value}</span>
            {s.delta && (
              <span className={cn("text-xs font-medium", s.deltaTone === "destructive" ? "text-destructive" : "text-success")}>
                {s.delta}
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

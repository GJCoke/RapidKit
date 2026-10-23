import type { ReactNode } from "react"
import { parseApiDate } from "@/shared/date-time"
export function queueNumber(value: number | null | undefined, locale: string, digits = 2) {
  return value === null || value === undefined ? "—" : value.toLocaleString(locale, { maximumFractionDigits: digits })
}
export function queueTime(value: string | number | null | undefined, locale: string) {
  if (value === null || value === undefined || value === "") return "—"
  const date = typeof value === "number" ? new Date(value) : parseApiDate(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(locale) : "—"
}
export function QueueSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={`grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4 ${className}`}
    >
      <header className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

/** Explicit instants use the platform zone; legacy offset-free values are already platform wall times. */
export function formatPlatformTime(value: string, zone: string, locale: string) {
  const explicit = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
  const instant = new Date(explicit ? value : `${value.replace(" ", "T")}Z`)
  if (!Number.isFinite(instant.getTime())) return "—"
  return new Intl.DateTimeFormat(locale, {
    timeZone: explicit ? zone : "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant)
}

export function platformDateRange(now: Date, zone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  )
  const end = `${parts.year}-${parts.month}-${parts.day}`
  const start = new Date(`${end}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 29)
  return { start: start.toISOString().slice(0, 10), end, granularity: "day" as const }
}

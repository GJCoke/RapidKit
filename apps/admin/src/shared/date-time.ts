/** Backend date-times without an offset are UTC, including legacy space-separated values. */
export function parseApiDate(value: string): Date {
  const normalized = value.trim().replace(" ", "T")
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`)
}

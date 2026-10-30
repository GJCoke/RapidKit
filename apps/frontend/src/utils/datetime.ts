import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const dateOnly = /^\d{4}-\d{2}-\d{2}$/
const offset = /(Z|([+-])(\d{2}):?(\d{2}))$/i

/** The caller supplies the meaning of legacy timestamps without offsets. */
export function parseApiTime(value: string, legacyTimezone = "UTC") {
  if (!dayjs.utc(value).isValid()) return dayjs.utc(value)
  return offset.test(value) ? dayjs(value) : dayjs.tz(value, legacyTimezone)
}

export function formatApiTime(value?: string | null, zone?: string, format = "YYYY-MM-DD HH:mm:ss") {
  if (!value) return "—"
  if (dateOnly.test(value)) return dayjs.utc(value).format(format === "YYYY-MM-DD HH:mm:ss" ? "YYYY-MM-DD" : format)
  const parsed = parseApiTime(value, zone || "UTC")
  if (!parsed.isValid()) return "—"
  if (zone) return parsed.tz(zone).format(format)
  // EditableInstant carries the platform's offset at the event time.
  const match = value.match(offset)
  const minutes = match?.[2] ? (Number(match[3]) * 60 + Number(match[4])) * (match[2] === "-" ? -1 : 1) : 0
  return parsed.utcOffset(minutes).format(format)
}

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { ref } from "vue"

dayjs.extend(utc)
dayjs.extend(timezone)

const dateOnly = /^\d{4}-\d{2}-\d{2}$/
const offset = /(Z|([+-])(\d{2}):?(\d{2}))$/i

// Authenticated bootstrap replaces this before business pages are mounted.
const platformTimezone = ref("UTC")

export function getPlatformTimezone() {
  return platformTimezone.value
}

export function setPlatformTimezone(zone: string) {
  new Intl.DateTimeFormat("en", { timeZone: zone }).format()
  platformTimezone.value = zone
}

/** The caller supplies the meaning of legacy timestamps without offsets. */
export function parseApiTime(value: string, legacyTimezone = getPlatformTimezone()) {
  if (!dayjs.utc(value).isValid()) return dayjs.utc(value)
  return offset.test(value) ? dayjs(value) : dayjs.tz(value, legacyTimezone)
}

export function formatApiTime(value?: string | null, zone = getPlatformTimezone(), format = "YYYY-MM-DD HH:mm:ss") {
  if (!value) return "—"
  if (dateOnly.test(value)) return dayjs.utc(value).format(format === "YYYY-MM-DD HH:mm:ss" ? "YYYY-MM-DD" : format)
  const parsed = parseApiTime(value, zone)
  if (!parsed.isValid()) return "—"
  return parsed.tz(zone).format(format)
}

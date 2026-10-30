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

// Intl reads calendar fields directly; Day.js .tz() reparses them in the browser
// zone, which can move a valid platform time through a browser DST gap.
const calendars = new Map<string, Intl.DateTimeFormat>()
function inZone(instant: ReturnType<typeof dayjs>, zone: string) {
  let calendar = calendars.get(zone)
  if (!calendar) {
    calendar = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
    calendars.set(zone, calendar)
  }
  const parts = Object.fromEntries(calendar.formatToParts(instant.toDate()).map(({ type, value }) => [type, value]))
  const wall = dayjs.utc(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`)
  const minutes = Math.round((wall.valueOf() - Math.floor(instant.valueOf() / 1000) * 1000) / 60000)
  return { calendar: wall.millisecond(instant.millisecond()), offset: minutes }
}

function resolveWall(value: string, zone: string) {
  const wall = dayjs.utc(value)
  if (!wall.isValid()) return wall
  const pattern = "YYYY-MM-DDTHH:mm:ss"
  const normalized = value.replace(" ", "T")
  const target =
    normalized.length === 10
      ? `${normalized}T00:00:00`
      : normalized.length === 16
        ? `${normalized}:00`
        : normalized.slice(0, 19)
  if (wall.format(pattern) !== target) return dayjs.utc(NaN)
  const offsets = new Set([-1, 0, 1].map((day) => inZone(wall.add(day, "day"), zone).offset))
  const candidates = [...offsets]
    .map((minutes) => wall.subtract(minutes, "minute"))
    .filter((candidate) => inZone(candidate, zone).calendar.format(pattern) === target)
    .sort((a, b) => a.valueOf() - b.valueOf())
  return candidates[0] ?? dayjs.utc(NaN)
}

/** Legacy timestamps without offsets represent the supplied platform calendar. */
export function parseApiTime(value: string, legacyTimezone = getPlatformTimezone()) {
  return offset.test(value) ? dayjs.utc(value) : resolveWall(value, legacyTimezone)
}

/** Resolve wall-clock input without using the browser's local calendar. */
export function parsePlatformTimeInput(value: string, originalInstant?: string | null) {
  if (offset.test(value)) return parseApiTime(value)
  const wall = value.length === 16 ? `${value}:00` : value
  const zone = getPlatformTimezone()
  if (originalInstant && formatApiTime(originalInstant, zone, "YYYY-MM-DDTHH:mm:ss") === wall)
    return parseApiTime(originalInstant)
  // New repeated times choose the first occurrence; unchanged edits keep their fold.
  return resolveWall(wall, zone)
}

export function formatApiTime(value?: string | null, zone = getPlatformTimezone(), format = "YYYY-MM-DD HH:mm:ss") {
  if (!value) return "—"
  if (dateOnly.test(value)) return dayjs.utc(value).format(format === "YYYY-MM-DD HH:mm:ss" ? "YYYY-MM-DD" : format)
  const parsed = parseApiTime(value, zone)
  if (!parsed.isValid()) return "—"
  return inZone(parsed, zone).calendar.format(format)
}

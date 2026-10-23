import dayjs from "dayjs"

export function formatNotificationTime(value: string, locale: string, now: number, compact: boolean) {
  const created = dayjs(value)
  if (!created.isValid()) return value
  if (!compact) return created.format("YYYY-MM-DD HH:mm:ss")
  const seconds = Math.floor((created.valueOf() - now) / 1000)
  if (seconds <= -86400) return created.format("HH:mm")
  if (seconds > 0) return created.format("YYYY-MM-DD HH:mm")
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (seconds > -60) return formatter.format(0, "second")
  if (seconds > -3600) return formatter.format(Math.ceil(seconds / 60), "minute")
  return formatter.format(Math.ceil(seconds / 3600), "hour")
}

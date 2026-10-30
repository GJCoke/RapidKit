import dayjs from "dayjs"
import { formatApiTime, parseApiTime } from "@/utils/datetime"

type DatedMessage = { createTime: string }

export function groupNotifications<T extends DatedMessage>(items: T[], now = Date.now()) {
  const today = formatApiTime(new Date(now).toISOString(), undefined, "YYYY-MM-DD")
  const yesterday = dayjs.utc(today).subtract(1, "day").format("YYYY-MM-DD")
  const groups = new Map<string, { date: string; period: "today" | "yesterday" | "date"; items: T[] }>()

  for (const item of [...items].sort(
    (a, b) => parseApiTime(b.createTime).valueOf() - parseApiTime(a.createTime).valueOf(),
  )) {
    const date = formatApiTime(item.createTime, undefined, "YYYY-MM-DD").replace("—", "")
    let group = groups.get(date)
    if (!group) {
      const period = date === today ? "today" : date === yesterday ? "yesterday" : "date"
      group = { date, period, items: [] }
      groups.set(date, group)
    }
    group.items.push(item)
  }

  return [...groups.values()]
}

export function formatNotificationTime(createTime: string, locale: string, now = Date.now()): string {
  const created = parseApiTime(createTime)
  if (!created.isValid()) return createTime
  const seconds = Math.floor((created.valueOf() - now) / 1000)
  if (seconds > 0 || seconds <= -86400) return formatApiTime(createTime, undefined, "YYYY-MM-DD HH:mm")
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (seconds > -60) return formatter.format(0, "second")
  if (seconds > -3600) return formatter.format(Math.ceil(seconds / 60), "minute")
  return formatter.format(Math.ceil(seconds / 3600), "hour")
}

import dayjs from "dayjs"

type DatedMessage = { createTime: string }

export function groupNotifications<T extends DatedMessage>(items: T[], now = Date.now()) {
  const today = dayjs(now).startOf("day")
  const yesterday = today.subtract(1, "day")
  const groups = new Map<string, { date: string; period: "today" | "yesterday" | "date"; items: T[] }>()

  for (const item of [...items].sort((a, b) => dayjs(b.createTime).valueOf() - dayjs(a.createTime).valueOf())) {
    const created = dayjs(item.createTime)
    const date = created.isValid() ? created.format("YYYY-MM-DD") : ""
    let group = groups.get(date)
    if (!group) {
      const period = created.isSame(today, "day") ? "today" : created.isSame(yesterday, "day") ? "yesterday" : "date"
      group = { date, period, items: [] }
      groups.set(date, group)
    }
    group.items.push(item)
  }

  return [...groups.values()]
}

export function formatNotificationTime(createTime: string, locale: string, now = Date.now()): string {
  const created = dayjs(createTime)
  if (!created.isValid()) return createTime
  const seconds = Math.floor((created.valueOf() - now) / 1000)
  if (seconds > 0 || seconds <= -86400) return created.format("YYYY-MM-DD HH:mm")
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (seconds > -60) return formatter.format(0, "second")
  if (seconds > -3600) return formatter.format(Math.ceil(seconds / 60), "minute")
  return formatter.format(Math.ceil(seconds / 3600), "hour")
}

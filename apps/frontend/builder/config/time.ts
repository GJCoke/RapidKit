import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

export function getBuildTime() {
  dayjs.extend(utc)
  dayjs.extend(timezone)

  return dayjs.tz(Date.now(), "Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss")
}

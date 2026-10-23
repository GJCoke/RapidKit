import { expect, test } from "vitest"
import { parseApiDate } from "@/shared/date-time"
test.each(["2030-10-23T08:00:00", "2030-10-23 08:00:00", "2030-10-23T08:00:00Z", "2030-10-23T16:00:00+08:00"])(
  "API date %s represents the same UTC instant",
  (value) => {
    expect(parseApiDate(value).getTime()).toBe(Date.parse("2030-10-23T08:00:00Z"))
  },
)

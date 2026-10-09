import { describe, expect, it } from "vitest"
import {
  filterEntries,
  formatEntry,
  normalizeLogs,
  positiveInteger,
  retainEntries,
  safeFilename,
} from "../../src/components/common/log-viewer/log-utils"

describe("log data contracts", () => {
  it("gives an explicitly empty records array priority over text", () => {
    expect(normalizeLogs("ignored", [])).toEqual([])
    expect(normalizeLogs("")).toEqual([])
  })
  it("preserves CRLF blank lines and removes only the trailing terminator", () => {
    expect(normalizeLogs("first\r\n\r\nlast\r\n").map((e) => e.message)).toEqual(["first", "", "last"])
    expect(normalizeLogs("\n\n").map((e) => e.message)).toEqual(["", ""])
  })
  it("limits whole records and retains original numbers without mutating input", () => {
    const records = [
      { id: "a", message: "old" },
      { id: "b", message: "failed\n  at run()", level: "ERROR" as const },
    ]
    const result = retainEntries(normalizeLogs(undefined, records), 1)
    expect(result.omitted).toBe(1)
    expect(result.entries[0]).toMatchObject({ number: 2, message: "failed\n  at run()" })
    expect(records).toHaveLength(2)
  })
  it("filters case-insensitively over displayed fields and excludes unclassified records for a level", () => {
    const entries = normalizeLogs(undefined, [
      { id: 1, timestamp: "12:30", level: "WARN", message: "Retry" },
      { id: 2, message: "retry" },
    ])
    expect(filterEntries(entries, "RETRY", "WARN").map((e) => e.id)).toEqual([1])
    expect(filterEntries(entries, "12:30", "").map((e) => e.id)).toEqual([1])
    expect(filterEntries(entries, "retry", "")).toHaveLength(2)
  })
  it("exports the displayed fields with multiline messages and no decorative number", () => {
    const entry = normalizeLogs(undefined, [
      { id: 9, timestamp: "12:30", level: "ERROR", message: "failure\n  stack" },
    ])[0]!
    expect(formatEntry(entry)).toBe("12:30 [ERROR] failure\n  stack")
  })
  it("rejects invalid dimensions and removes path/control characters from filenames", () => {
    for (const n of [0, -1, NaN, Infinity, 1.5]) expect(positiveInteger(n, 5000)).toBe(5000)
    expect(positiveInteger(1, 5000)).toBe(1)
    expect(safeFilename("../folder\\run\n.log")).toBe("..folderrun.log")
    expect(safeFilename("..")).toBe("logs.log")
  })
})

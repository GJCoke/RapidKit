import { expect, test } from "vitest"
import {
  normalizeLogs,
  retainEntries,
  filterEntries,
  formatEntry,
  structuredAdditions,
} from "@/shared/code-viewers/log-model"
test("text logs normalize CRLF, preserve internal empty lines and retain original line numbers", () => {
  const rows = normalizeLogs("one\r\n\r\nthree\n")
  expect(rows.map((row) => row.message)).toEqual(["one", "", "three"])
  expect(retainEntries(rows, 2)).toEqual({ entries: rows.slice(1), omitted: 1 })
  expect(retainEntries(rows, 2).entries[0].number).toBe(2)
  expect(normalizeLogs("")).toEqual([])
})
test("structured levels and timestamps participate in search and export, and explicit records override text", () => {
  const rows = normalizeLogs("ignored", [
    { id: 1, message: "ready", level: "INFO", timestamp: "2026-10-24" },
    { id: 2, message: "failed", level: "ERROR" },
  ])
  expect(filterEntries(rows, "INFO", "").map((row) => row.id)).toEqual([1])
  expect(filterEntries(rows, "FAILED", "ERROR").map((row) => row.id)).toEqual([2])
  expect(filterEntries(rows, "ready", "ERROR")).toEqual([])
  expect(formatEntry(rows[0])).toBe("2026-10-24 [INFO] ready")
  expect(normalizeLogs("ignored", [])).toEqual([])
})
test("append detection accepts an unchanged rolling overlap and rejects replacement, reordered or edited records", () => {
  const previous = normalizeLogs(undefined, [
      { id: 1, message: "one" },
      { id: 2, message: "two" },
    ]),
    next = normalizeLogs(undefined, [
      { id: 2, message: "two" },
      { id: 3, message: "three" },
    ])
  expect(structuredAdditions(previous, next)?.map((row) => row.id)).toEqual([3])
  expect(
    structuredAdditions(
      previous,
      normalizeLogs(undefined, [
        { id: 2, message: "changed" },
        { id: 3, message: "three" },
      ]),
    ),
  ).toBeNull()
  expect(structuredAdditions(previous, normalizeLogs(undefined, [{ id: "1", message: "one" }]))).toBeNull()
  expect(structuredAdditions(previous, [])).toBeNull()
  expect(structuredAdditions([], next)).toEqual(next)
})
test("default retention is bounded at 5000 and invalid capacities cannot erase available logs", () => {
  const rows = normalizeLogs(
    undefined,
    Array.from({ length: 5002 }, (_, id) => ({ id, message: String(id) })),
  )
  for (const limit of [undefined, 0, -1, NaN, 1.5]) {
    const retained = retainEntries(rows, limit)
    expect(retained.entries).toHaveLength(5000)
    expect(retained.omitted).toBe(2)
  }
})

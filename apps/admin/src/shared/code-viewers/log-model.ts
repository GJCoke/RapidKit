export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export interface LogRecord {
  id: string | number
  message: string
  level?: LogLevel
  timestamp?: string
}

export interface LogViewerProps {
  log?: string
  records?: readonly LogRecord[]
  /** Change when switching streams, especially if the new stream reuses IDs. */
  sourceKey?: string | number
  title?: string
  loading?: boolean
  error?: string
  height?: number
  maxEntries?: number
  showLineNumbers?: boolean
  wrap?: boolean
  follow?: boolean
  filename?: string
}

export interface LogEntry extends LogRecord {
  number: number
}

import { safeFilename as sanitizeFilename } from "./text-actions"

export function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback
}

export function normalizeLogs(log?: string, records?: readonly LogRecord[]): LogEntry[] {
  if (records !== undefined) return records.map((record, index) => ({ ...record, number: index + 1 }))
  if (!log) return []
  const lines = log.replace(/\r\n/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.map((message, index) => ({ id: `text:${index + 1}`, message, number: index + 1 }))
}

export function retainEntries(entries: readonly LogEntry[], limit?: number) {
  const omitted = Math.max(0, entries.length - positiveInteger(limit, 5000))
  return { entries: entries.slice(omitted), omitted }
}

export function formatEntry(entry: LogRecord): string {
  const prefix = [entry.timestamp, entry.level ? `[${entry.level}]` : undefined].filter(Boolean).join(" ")
  return prefix ? `${prefix} ${entry.message}` : entry.message
}

export function filterEntries(entries: readonly LogEntry[], keyword: string, level: LogLevel | "") {
  const needle = keyword.toLowerCase()
  return entries.filter(
    (entry) => (!level || entry.level === level) && formatEntry(entry).toLowerCase().includes(needle),
  )
}

export function safeFilename(filename = "logs.log"): string {
  return sanitizeFilename(filename, "logs.log")
}

function sameRecord(left: LogRecord, right: LogRecord) {
  return (
    left.id === right.id &&
    left.message === right.message &&
    left.level === right.level &&
    left.timestamp === right.timestamp
  )
}

/** Accept an append or a rolling window with an unchanged overlapping suffix. */
export function structuredAdditions(previous: readonly LogEntry[], next: readonly LogEntry[]): LogEntry[] | null {
  if (!previous.length) return [...next]
  if (!next.length) return null
  const start = previous.findIndex((entry) => entry.id === next[0]!.id)
  if (start < 0) return null
  const overlap = previous.length - start
  if (next.length < overlap) return null
  for (let index = 0; index < overlap; index++) {
    if (!sameRecord(previous[start + index]!, next[index]!)) return null
  }
  return next.slice(overlap)
}

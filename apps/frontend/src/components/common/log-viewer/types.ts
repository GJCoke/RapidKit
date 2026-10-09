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

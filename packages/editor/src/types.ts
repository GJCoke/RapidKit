export interface MonacoEditorProps {
  modelValue?: string
  language?: string
  theme?: "vs" | "vs-dark"
  readOnly?: boolean
  minimap?: boolean
  height?: string
}

export type OutputStatus = "idle" | "running" | "success" | "error"

export interface OutputPanelProps {
  output?: string
  error?: string | null
  status?: OutputStatus
  runtime?: number | null
  theme?: "vs" | "vs-dark"
}

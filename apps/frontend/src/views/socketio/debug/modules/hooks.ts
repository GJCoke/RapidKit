import { ref } from "vue"

export interface LogItem {
  type: "info" | "error" | "send" | "receive"
  time: string
  event?: string
  content: string
}

export function useSocketLog() {
  const logs = ref<LogItem[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addLog = (type: LogItem["type"], content: any, event?: string) => {
    logs.value.unshift({
      type,
      time: new Date().toLocaleTimeString(),
      event,
      content: typeof content === "object" ? JSON.stringify(content, null, 2) : String(content),
    })
  }

  const clearLogs = () => {
    logs.value = []
  }

  return {
    logs,
    addLog,
    clearLogs,
  }
}

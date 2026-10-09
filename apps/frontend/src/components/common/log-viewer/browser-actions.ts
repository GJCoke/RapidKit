import { downloadText } from "@/utils/text-actions"
import { safeFilename } from "./log-utils"

export { copyText as copyLogs } from "@/utils/text-actions"

export function downloadLogs(text: string, filename?: string): void {
  downloadText(text, safeFilename(filename))
}

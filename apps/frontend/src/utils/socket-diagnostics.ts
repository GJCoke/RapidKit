import { requestIdsFromHeaders } from "@rapidkit/utils"
import { getAuthSession } from "@/service/request/auth-session"
import { captureBrowserError } from "@/observability"
import { $t } from "@/locales"
import { diagnosticGeneration } from "./diagnostics"
import { diagnosticMessage } from "./diagnostic-message"

export function reportSocketDiagnostic(payload: unknown, owner: number) {
  getAuthSession()
  if (owner !== diagnosticGeneration() || !payload || typeof payload !== "object") return
  const requestId = requestIdsFromHeaders({ "x-request-id": (payload as { requestId?: unknown }).requestId }).requestId
  if (!requestId) return
  const diagnosticId = captureBrowserError(new Error("Socket operation failed"), "socket", requestId)
  window.$message?.error(
    diagnosticMessage($t("request.serverError"), { request_id: requestId, diagnostic_id: diagnosticId }),
  )
}

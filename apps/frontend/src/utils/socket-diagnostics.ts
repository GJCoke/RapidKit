import { requestIdsFromHeaders } from "@rapidkit/utils"
import { getAuthSession } from "@/service/request/auth-session"
import { captureBrowserError } from "@/observability"
import { $t } from "@/locales"
import {
  diagnosticGeneration,
  recordDiagnosticEvent,
  safeSocketContext,
  type DiagnosticEventInput,
} from "./diagnostics"
import type { createLogger } from "./logger"
import { diagnosticMessage } from "./diagnostic-message"

export function socketReason(reason: string) {
  const reasons = new Map(
    Object.entries({
      "io server disconnect": "server_disconnect",
      "io client disconnect": "client_disconnect",
      "transport close": "transport_close",
      "ping timeout": "ping_timeout",
      "forced close": "forced_close",
      "transport error": "transport_error",
      "parse error": "parse_error",
      unauthorized: "unauthorized",
      forbidden: "forbidden",
      token_expired: "token_expired",
    }),
  )
  return reasons.get(reason) || "other"
}

/** One bounded failure episode per socket, independent of server error messages. */
export function createSocketDiagnostics(
  namespace: string,
  connectionId: () => unknown,
  owner: number,
  logger: ReturnType<typeof createLogger>,
) {
  let lastId: string | undefined
  let failures = 0
  let recovering = false
  let started = 0
  let warnedAt = -Infinity
  const current = () => {
    getAuthSession()
    return owner === diagnosticGeneration()
  }
  const context = () => safeSocketContext(namespace, lastId)
  const record = (fields: Omit<DiagnosticEventInput, "category">) => {
    if (!current()) return
    if (fields.phase === "reconnecting" && !recovering) {
      recovering = true
      started = performance.now()
    }
    recordDiagnosticEvent({ category: "socket", ...context(), ...fields }, owner)
    if (fields.operation === "auth.refresh" && fields.phase === "failure")
      logger.warn("Socket authentication recovery failed", {
        ...context(),
        reason_code: "refresh_failed",
        duration_ms: fields.duration_ms,
      })
  }
  return {
    record,
    connected() {
      if (!current()) return
      lastId = safeSocketContext(namespace, connectionId()).socket_connection_id as string | undefined
      record({ phase: "connected" })
      logger.debug("Socket connected", context())
      if (recovering) {
        const fields = { ...context(), attempt: failures, duration_ms: Math.round(performance.now() - started) }
        record({ phase: "success", ...fields })
        logger.info("Socket connection recovered", fields)
      }
      failures = 0
      recovering = false
      warnedAt = -Infinity
    },
    failed(reason: string) {
      if (!current()) return
      if (!recovering) started = performance.now()
      recovering = true
      failures = Math.min(failures + 1, 1000)
      record({
        phase: "failure",
        reason_code: reason,
        attempt: failures,
        duration_ms: Math.round(performance.now() - started),
      })
      if (failures === 1 && reason === "connect_error") logger.error("Socket connection failed", { reason })
      if (failures >= 3 && performance.now() - warnedAt >= 60000) {
        warnedAt = performance.now()
        logger.warn("Socket connection remains unavailable", {
          ...context(),
          reason_code: reason,
          attempt: failures,
          duration_ms: Math.round(performance.now() - started),
        })
      }
    },
  }
}

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

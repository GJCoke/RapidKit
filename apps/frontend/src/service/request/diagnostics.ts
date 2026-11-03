import type { AxiosError, AxiosResponse } from "@rapidkit/axios"
import { requestIdsFromHeaders } from "@rapidkit/utils"
import { createLogger, logPath } from "@/utils/logger"
import { diagnosticGeneration, recordDiagnosticEvent } from "@/utils/diagnostics"
import type { DiagnosticAction, DiagnosticOperation } from "@/utils/diagnostics"

const logger = createLogger("request")
interface RequestContext {
  operation: DiagnosticOperation
  action?: DiagnosticAction
  generation: number
  attempt?: number
}
type Config = AxiosResponse["config"] & { diagnostics?: RequestContext }
interface Attempt {
  context: RequestContext
  started: number
  clientId?: string
  finished: boolean
}
const attempts = new WeakMap<object, Attempt>()

export function diagnosticRequest(operation: DiagnosticOperation, action?: DiagnosticAction) {
  return { diagnostics: { operation, action, generation: action?.generation ?? diagnosticGeneration() } }
}

export function startRequestDiagnostics(config: Config) {
  const inherited: RequestContext = config.diagnostics || diagnosticRequest("other").diagnostics
  const context = { ...inherited, attempt: (inherited.attempt || 0) + 1 }
  config.diagnostics = context
  const clientId = requestIdsFromHeaders(config.headers).requestId
  attempts.set(config, { context, started: performance.now(), clientId, finished: false })
  const fields = {
    operation: context.operation,
    action_id: context.action?.generation === context.generation ? context.action.actionId : undefined,
    client_request_id: clientId,
    method: config.method?.toUpperCase(),
    attempt: context.attempt,
  }
  recordDiagnosticEvent({ category: "request", phase: "start", ...fields }, context.generation)
  if (context.generation === diagnosticGeneration())
    logger.debug("Request started", { ...fields, path: logPath(config.url) })
}

export function completeRequestDiagnostics(config: Config, response?: AxiosResponse, error?: AxiosError) {
  const attempt = attempts.get(config)
  if (!attempt || attempt.context.generation !== diagnosticGeneration()) return undefined
  const { context } = attempt
  const ids = requestIdsFromHeaders(response?.headers)
  const code = response?.data?.code
  const businessCode =
    typeof code === "number" ? code : typeof code === "string" && /^\d{1,6}$/.test(code) ? Number(code) : undefined
  const fields = {
    operation: context.operation,
    action_id: context.action?.generation === context.generation ? context.action.actionId : undefined,
    client_request_id: attempt.clientId,
    request_id: ids.requestId,
    edge_request_id: ids.edgeRequestId,
    method: config.method?.toUpperCase(),
    http_status: response?.status,
    business_code: businessCode,
    duration_ms: Math.round((performance.now() - attempt.started) * 1000) / 1000,
    attempt: context.attempt,
  }
  if (!attempt.finished) {
    attempt.finished = true
    const failed =
      Boolean(error) ||
      (response?.status || 0) >= 400 ||
      (businessCode !== undefined && businessCode !== Number(import.meta.env.VITE_SERVICE_SUCCESS_CODE))
    recordDiagnosticEvent(
      {
        category: "request",
        phase: error?.code === "ERR_CANCELED" ? "cancelled" : failed ? "failure" : "success",
        ...fields,
      },
      context.generation,
    )
    logger.debug("Request completed", { ...fields, status: response?.status, path: logPath(config.url) })
  }
  return fields
}

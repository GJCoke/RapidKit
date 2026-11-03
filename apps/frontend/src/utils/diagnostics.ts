import { nanoid } from "@rapidkit/utils"
import { generatedRoutes } from "@/router/elegant/routes"

export type DiagnosticCategory =
  | "runtime"
  | "promise"
  | "bootstrap"
  | "render"
  | "route"
  | "request"
  | "socket"
  | "resource"
export type DiagnosticOperation = "other" | "user.create" | "role.permissions.save" | "task.run" | "auth.refresh"
export type DiagnosticActionCode = "user.create.submit" | "role.permissions.save" | "task.run.submit"
export interface DiagnosticAction {
  readonly actionId: string
  readonly generation: number
  readonly code: DiagnosticActionCode
}
export interface DiagnosticEventInput {
  category: "navigation" | "action" | "request" | "socket" | "identity"
  phase: "start" | "success" | "failure" | "cancelled" | "connected" | "disconnected" | "reconnecting" | "changed"
  route?: unknown
  operation?: DiagnosticOperation
  action_code?: DiagnosticActionCode
  action_id?: string
  client_request_id?: string
  request_id?: string
  edge_request_id?: string
  method?: string
  http_status?: number
  business_code?: number
  duration_ms?: number
  attempt?: number
  reason_code?: string
}
type SafeFields = Record<string, string | number>
type TimelineEvent = SafeFields & { seq: number; time: string; category: string; phase: string }
interface Incident {
  diagnostic_id: string
  time: string
  category: DiagnosticCategory
  error_type: string
  frames: { file: string; line: number; column: number }[]
  context: SafeFields
  events: TimelineEvent[]
}

const operations = new Set(["other", "user.create", "role.permissions.save", "task.run", "auth.refresh"])
const actions = new Set(["user.create.submit", "role.permissions.save", "task.run.submit"])
const categories = new Set(["navigation", "action", "request", "socket", "identity"])
const errorCategories = new Set(["runtime", "promise", "bootstrap", "render", "route", "request", "socket", "resource"])
const phases = new Set([
  "start",
  "success",
  "failure",
  "cancelled",
  "connected",
  "disconnected",
  "reconnecting",
  "changed",
])
const reasons = new Set([
  "connect_error",
  "transport_close",
  "ping_timeout",
  "client_disconnect",
  "server_disconnect",
  "forced_close",
  "transport_error",
  "parse_error",
  "other",
])
const errorTypes = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "URIError",
  "AggregateError",
])
const routeNames = new Set(["root", "not-found"])
function registerRoutes(routes: readonly { name: string; children?: readonly { name: string }[] }[]) {
  for (const route of routes) {
    routeNames.add(route.name)
    if (route.children) registerRoutes(route.children)
  }
}
registerRoutes(generatedRoutes)

const encoder = new TextEncoder()
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length
let generation = 0
let pageId = nanoid()
let sequence = 0
let dropped = 0
let events: { at: number; event: TimelineEvent }[] = []
let incidents: Incident[] = []
let seen = new WeakMap<Error, string>()
const rates = new Map<string, { at: number; count: number }>()
let totalRate = { at: performance.now(), count: 0 }

export function diagnosticGeneration() {
  return generation
}

export function resetDiagnostics() {
  generation++
  pageId = nanoid()
  sequence = 0
  dropped = 0
  events = []
  incidents = []
  seen = new WeakMap()
  rates.clear()
  totalRate = { at: performance.now(), count: 0 }
}

function safeFields(input: unknown): SafeFields {
  const value = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const output: SafeFields = {}
  if (typeof value.asset_file === "string" && /^[A-Za-z0-9_.-]{1,128}\.(?:js|mjs|css)$/.test(value.asset_file))
    output.asset_file = value.asset_file
  for (const [key, allowed] of [
    ["operation", operations],
    ["action_code", actions],
    ["route", routeNames],
    ["reason_code", reasons],
  ] as const) {
    const item = value[key]
    if (typeof item === "string" && allowed.has(item)) output[key] = item
  }
  for (const key of ["action_id", "client_request_id", "request_id", "edge_request_id"] as const) {
    const item = value[key]
    if (typeof item === "string" && (key === "edge_request_id" ? /^[a-f0-9]{32}$/i : /^[A-Za-z0-9_-]{21}$/).test(item))
      output[key] = item
  }
  if (typeof value.method === "string" && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(value.method))
    output.method = value.method
  for (const [key, max] of [
    ["http_status", 599],
    ["business_code", 999999],
    ["duration_ms", 86400000],
    ["attempt", 1000],
  ] as const) {
    const item = value[key]
    if (typeof item === "number" && Number.isFinite(item) && item >= (key === "http_status" ? 100 : 0) && item <= max)
      output[key] = item
  }
  return output
}

function trimEvents() {
  const cutoff = performance.now() - 300000
  while (
    events.length &&
    (events[0].at < cutoff || events.length > 50 || bytes(events.map(({ event }) => event)) > 16384)
  )
    events.shift()
}

export function recordDiagnosticEvent(input: DiagnosticEventInput, owner = generation) {
  if (owner !== generation) return
  if (!categories.has(input.category) || !phases.has(input.phase)) return
  const event: TimelineEvent = {
    seq: ++sequence,
    time: new Date().toISOString(),
    category: input.category,
    phase: input.phase,
    ...safeFields(input),
  }
  if (bytes(event) > 512) {
    dropped++
    return
  }
  events.push({ at: performance.now(), event })
  trimEvents()
}

export function startDiagnosticAction(code: DiagnosticActionCode): DiagnosticAction {
  const action = Object.freeze({ actionId: nanoid(), generation, code })
  recordDiagnosticEvent({ category: "action", phase: "start", action_code: code, action_id: action.actionId })
  return action
}

export function finishDiagnosticAction(action: DiagnosticAction, outcome: "success" | "failure" | "cancelled") {
  recordDiagnosticEvent(
    { category: "action", phase: outcome, action_code: action.code, action_id: action.actionId },
    action.generation,
  )
}

export function captureDiagnosticError(
  error: unknown,
  category: DiagnosticCategory,
  fields: unknown = {},
  owner = generation,
) {
  if (owner !== generation || !errorCategories.has(category)) return undefined
  if (error instanceof Error && seen.has(error)) return seen.get(error)
  const type = error instanceof Error && errorTypes.has(error.name) ? error.name : "Error"
  const frames: Incident["frames"] = []
  const stack = error instanceof Error && typeof error.stack === "string" ? error.stack.slice(-16000) : ""
  for (const match of stack.matchAll(/\/assets\/([A-Za-z0-9_.-]{1,128}\.(?:js|mjs)):(\d{1,9}):(\d{1,9})/g)) {
    frames.push({ file: match[1], line: Number(match[2]), column: Number(match[3]) })
    if (frames.length === 10) break
  }
  const context = safeFields(fields)
  const key = `${category}:${type}:${JSON.stringify(frames[0])}:${context.operation || "other"}`
  const now = performance.now()
  for (const [name, rate] of rates) if (now - rate.at >= 60000) rates.delete(name)
  if (now - totalRate.at >= 60000) totalRate = { at: now, count: 0 }
  if ((rates.get(key)?.count || 0) >= 3 || totalRate.count >= 20) {
    dropped++
    return undefined
  }
  if (!rates.has(key) && rates.size >= 100) rates.delete(rates.keys().next().value!)
  const rate = rates.get(key) || { at: now, count: 0 }
  rate.count++
  rates.set(key, rate)
  totalRate.count++
  trimEvents()
  const id = nanoid()
  incidents.push({
    diagnostic_id: id,
    time: new Date().toISOString(),
    category,
    error_type: type,
    frames,
    context,
    events: events.map(({ event }) => ({ ...event })),
  })
  if (incidents.length > 3) incidents.shift()
  if (error instanceof Error) seen.set(error, id)
  return id
}

export function getDiagnosticPackage() {
  trimEvents()
  const report = {
    schema_version: 1,
    application: "vue",
    build_time: typeof BUILD_TIME === "string" ? BUILD_TIME.slice(0, 160) : "unknown",
    environment: ["development", "test", "prod", "production"].includes(import.meta.env.MODE)
      ? import.meta.env.MODE
      : "other",
    exported_at: new Date().toISOString(),
    page_instance_id: pageId,
    dropped_count: dropped,
    events: events.map(({ event }) => ({ ...event })),
    incidents: incidents.map((incident) => ({ ...incident })),
    lookup: { request_ids: [] as string[], edge_request_ids: [] as string[], client_request_ids: [] as string[] },
  }
  function updateLookup() {
    const entries = [
      ...report.events,
      ...report.incidents.flatMap((incident) => [...incident.events, incident.context]),
    ]
    for (const key of ["request_id", "edge_request_id", "client_request_id"] as const) {
      report.lookup[`${key}s`] = [
        ...new Set(entries.map((event) => event[key]).filter((value): value is string => typeof value === "string")),
      ]
    }
  }
  updateLookup()
  while (bytes(report) > 65536 && report.incidents.length > 1) {
    report.incidents.shift()
    updateLookup()
  }
  while (bytes(report) > 65536 && report.events.length) {
    report.events.shift()
    updateLookup()
  }
  return JSON.parse(JSON.stringify(report)) as typeof report
}

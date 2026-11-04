import { h, ref, watch, type Ref } from "vue"
import { NButton, type NotificationReactive } from "naive-ui"
import { copyRequestId, safeRequestId } from "@rapidkit/utils"
import { $t } from "@/locales"
import DiagnosticNotification from "@/components/common/diagnostic-notification.vue"
import { getAuthSession } from "@/service/request/auth-session"
import { diagnosticGeneration } from "./diagnostics"
import { downloadDiagnosticPackage } from "./download-diagnostics"

export interface DiagnosticReference {
  request_id?: string
  edge_request_id?: string
  client_request_id?: string
  diagnostic_id?: string
}

export function diagnosticMessage(message: string, reference?: string | DiagnosticReference) {
  const values: DiagnosticReference =
    typeof reference === "string"
      ? /^[a-f0-9]{32}$/i.test(reference)
        ? { edge_request_id: reference }
        : { request_id: reference }
      : reference || {}
  const ids = (
    [
      ["request_id", "request.requestId"],
      ["edge_request_id", "request.edgeRequestId"],
      ["client_request_id", "request.clientRequestId"],
      ["diagnostic_id", "request.diagnosticId"],
    ] as const
  ).flatMap(([key, label]) => {
    const id = safeRequestId(values[key])
    const validKind = id && (key === "edge_request_id" ? /^[a-f0-9]{32}$/i : /^[A-Za-z0-9_-]{21}$/).test(id)
    return validKind ? [{ id, label }] : []
  })
  if (!ids.length) return message
  return () =>
    h("div", { class: "flex flex-col gap-1" }, [
      h("span", message),
      ...ids.flatMap(({ id, label }) => [
        h("span", $t(label)),
        h("code", { class: "select-all", "aria-label": $t(label) }, id),
        h(
          NButton,
          {
            size: "tiny",
            onClick: () => {
              void copyRequestId(id)
            },
          },
          { default: () => $t("request.copyRequestId") },
        ),
      ]),
      h(
        NButton,
        {
          size: "tiny",
          onClick: () => {
            if (!downloadDiagnosticPackage()) window.$message?.error($t("request.exportFailed"))
          },
        },
        { default: () => $t("request.exportDiagnostics") },
      ),
    ])
}

export interface DiagnosticReferenceItem {
  readonly id: string
  readonly label: "request.requestId" | "request.edgeRequestId" | "request.clientRequestId" | "request.diagnosticId"
}
interface DiagnosticNotice {
  key: string
  at: number
  count: Ref<number>
  notification?: NotificationReactive
}
const notices: DiagnosticNotice[] = []

export function clearDiagnosticNotifications() {
  for (const entry of notices.splice(0)) entry.notification?.destroy()
}
watch(diagnosticGeneration, clearDiagnosticNotifications, { flush: "sync" })

export function showDiagnosticNotification(
  message: string,
  reference?: string | DiagnosticReference,
  context: { source: "request" | "bootstrap" | "socket"; group?: string } = { source: "request" },
) {
  if (!window.$notification) {
    window.$message?.error(message)
    return
  }
  getAuthSession()
  const key = JSON.stringify([context.source, context.group || "", message])
  const at = performance.now()
  const existing = notices.find((entry) => entry.key === key && at - entry.at < 5000)
  if (existing) {
    existing.count.value++
    return
  }
  const value =
    typeof reference === "string"
      ? /^[a-f0-9]{32}$/i.test(reference)
        ? { edge_request_id: reference }
        : { request_id: reference }
      : reference || {}
  const references: readonly DiagnosticReferenceItem[] = Object.freeze(
    (
      [
        ["request_id", "request.requestId"],
        ["edge_request_id", "request.edgeRequestId"],
        ["client_request_id", "request.clientRequestId"],
        ["diagnostic_id", "request.diagnosticId"],
      ] as const
    ).flatMap(([field, label]) => {
      const id = safeRequestId(value[field])
      return id && (field === "edge_request_id" ? /^[a-f0-9]{32}$/i : /^[A-Za-z0-9_-]{21}$/).test(id)
        ? [Object.freeze({ id, label })]
        : []
    }),
  )
  const server = message === $t("request.serverError")
  const network = message === $t("request.networkError")
  const title = $t(server ? "request.serverErrorTitle" : network ? "request.networkErrorTitle" : "request.failureTitle")
  const description = server ? $t("request.serverErrorHint") : network ? $t("request.networkErrorHint") : message
  const owner = diagnosticGeneration()
  const entry: DiagnosticNotice = { key, at, count: ref(1) }
  const remove = () => {
    const index = notices.indexOf(entry)
    if (index >= 0) notices.splice(index, 1)
  }
  if (notices.length >= 3) notices.shift()?.notification?.destroy()
  notices.push(entry)
  entry.notification = window.$notification.error({
    title,
    duration: 0,
    closable: true,
    content: () => h(DiagnosticNotification, { description, references, count: entry.count.value, owner }),
    onClose: remove,
    onAfterLeave: remove,
  })
}

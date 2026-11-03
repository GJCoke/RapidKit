import { h } from "vue"
import { NButton } from "naive-ui"
import { copyRequestId, safeRequestId } from "@rapidkit/utils"
import { $t } from "@/locales"
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

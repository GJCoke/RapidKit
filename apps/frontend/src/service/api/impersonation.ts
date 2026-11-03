import { request } from "../request"
import { diagnosticMutation } from "../request/diagnostics"

export function fetchCreateImpersonation(data: Api.Impersonation.CreateBody) {
  return diagnosticMutation("impersonation.start", (diagnostics) =>
    request<Api.Impersonation.Created>({ url: "/auth/impersonations", method: "post", data, ...diagnostics }),
  )
}

export function fetchGetCurrentImpersonation() {
  return request<Api.Impersonation.Current>({ url: "/auth/impersonations/current", method: "get" })
}

export function fetchDeleteCurrentImpersonation() {
  return diagnosticMutation("impersonation.stop", (diagnostics) =>
    request<boolean>({ url: "/auth/impersonations/current", method: "delete", timeout: 5000, ...diagnostics }),
  )
}

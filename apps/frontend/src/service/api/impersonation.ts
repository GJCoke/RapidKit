import { request } from "../request"

export function fetchCreateImpersonation(data: Api.Impersonation.CreateBody) {
  return request<Api.Impersonation.Created>({ url: "/auth/impersonations", method: "post", data })
}

export function fetchGetCurrentImpersonation() {
  return request<Api.Impersonation.Current>({ url: "/auth/impersonations/current", method: "get" })
}

export function fetchDeleteCurrentImpersonation() {
  return request<boolean>({ url: "/auth/impersonations/current", method: "delete", timeout: 5000 })
}

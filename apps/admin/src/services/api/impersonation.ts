import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type CreateImpersonationBody = ApiRequest<"/api/v1/auth/impersonations", "post", "body">
export type ImpersonationCreated = ApiResponse<"/api/v1/auth/impersonations", "post">
export type ImpersonationCurrent = ApiResponse<"/api/v1/auth/impersonations/current">
export type ImpersonationSnapshot = Pick<ImpersonationCurrent, "sessionId" | "subject" | "expiresAt">

export function createImpersonation(data: CreateImpersonationBody) {
  return request<ImpersonationCreated>({ url: "/auth/impersonations", method: "post", data })
}
export function fetchCurrentImpersonation() {
  return request<ImpersonationCurrent>({ url: "/auth/impersonations/current", method: "get" })
}
export function stopImpersonation() {
  return request<boolean>({ url: "/auth/impersonations/current", method: "delete", timeout: 5000 })
}

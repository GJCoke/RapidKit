import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace Impersonation {
      type CreateBody = Service.ApiRequest<"/api/v1/auth/impersonations", "post", "body">
      type Created = Service.ApiResponse<"/api/v1/auth/impersonations", "post">
      type Current = Service.ApiResponse<"/api/v1/auth/impersonations/current">
      type Snapshot = Pick<Current, "sessionId" | "subject" | "expiresAt">
    }
  }
}

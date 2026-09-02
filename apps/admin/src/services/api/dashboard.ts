import { request } from "@/services/request"

export interface DashboardCapabilities {
  allowedModules: string[]
  revision: string
}

export function fetchDashboardCapabilities() {
  return request<DashboardCapabilities>({ url: "/dashboard/capabilities" })
}

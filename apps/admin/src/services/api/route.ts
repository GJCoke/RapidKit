import { request } from "@/services/request"

export interface BackendRoute {
  name: string
  path: string
  component?: string
  meta?: {
    title: string
    icon?: string
    order?: number
    hideInMenu?: boolean
  }
  children?: BackendRoute[]
}

export function fetchUserRoutes() {
  return request<BackendRoute[]>({
    url: "/route/user/routes",
  })
}

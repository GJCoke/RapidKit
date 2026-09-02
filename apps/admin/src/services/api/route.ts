import { request } from "@/services/request"

export interface BackendRoute {
  name: string
  path: string
  component?: string
  meta?: { title: string; i18nKey?: string; icon?: string; order?: number; hideInMenu?: boolean }
  children?: BackendRoute[]
}

export interface UserRouteResponse {
  routes: BackendRoute[]
  home: string
}

export function fetchUserRoutes() {
  return request<UserRouteResponse>({ url: "/route/user" })
}

export function fetchConstantRoutes() {
  return request<BackendRoute[]>({ url: "/route/constant" })
}

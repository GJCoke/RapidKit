import { request } from "@/services/request"

export interface BackendRoute {
  id?: string
  name: string
  path: string
  component?: string
  meta?: {
    title: string
    i18nKey?: string | null
    icon?: string | null
    localIcon?: string | null
    activeMenu?: string | null
    order?: number
    constant?: boolean
    hideInMenu?: boolean
    keepAlive?: boolean
    href?: string | null
    multiTab?: boolean
    fixedIndexInTab?: number | null
    query?: Array<{ key: string; value: string }> | null
  }
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

export function fetchRouteExists(routeName: string) {
  return request<boolean>({ url: "/route/exist", params: { routeName } })
}

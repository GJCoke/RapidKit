import type { paths } from "@/typings/schema"

declare namespace Service {
  /** Other baseURL key */
  type OtherBaseURLKey = "demo"

  interface ServiceConfigItem {
    /** The backend service base url */
    baseURL: string
    /** The proxy pattern of the backend service base url */
    proxyPattern: string
  }

  interface OtherServiceConfigItem extends ServiceConfigItem {
    key: OtherBaseURLKey
  }

  /** The backend service config */
  interface ServiceConfig extends ServiceConfigItem {
    /** Other backend service config */
    other: OtherServiceConfigItem[]
  }

  interface SimpleServiceConfig extends Pick<ServiceConfigItem, "baseURL"> {
    other: Record<OtherBaseURLKey, string>
  }

  /** The backend service response data */
  type Response<T = unknown> = {
    /** The backend service response code */
    code: string
    /** The backend service response message */
    message: string
    /** The backend service response data */
    data: T
  }

  /** The demo backend service response data */
  type DemoResponse<T = unknown> = {
    /** The backend service response code */
    status: string
    /** The backend service response message */
    message: string
    /** The backend service response data */
    result: T
  }

  type ParamLocation = "path" | "query" | "body"

  export type ApiRequest<P extends keyof paths, M extends keyof paths[P], T extends ParamLocation> = T extends "path"
    ? paths[P][M] extends { parameters: { path?: infer Path } }
      ? Path
      : never
    : T extends "query"
      ? paths[P][M] extends { parameters: { query?: infer Query } }
        ? Query
        : never
      : T extends "body"
        ? paths[P][M] extends { requestBody: { content: { "application/json": infer Body } } }
          ? Body
          : never
        : never

  export type ApiResponse<P extends keyof paths, M extends keyof paths[P] = "get"> = paths[P][M] extends {
    responses: { 200: infer R }
  }
    ? R extends { content: { "application/json": infer JSON } }
      ? JSON extends { data?: (infer D) | null }
        ? D
        : JSON
      : never
    : never
}

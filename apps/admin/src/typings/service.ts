import type { paths } from "./schema"

export type ApiPath = keyof paths
export type ApiMethod<P extends ApiPath> = keyof paths[P]
export type ApiParamLocation = "path" | "query" | "body"

export type ApiRequest<P extends ApiPath, M extends ApiMethod<P>, T extends ApiParamLocation> = T extends "path"
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

export type ApiResponse<P extends ApiPath, M extends ApiMethod<P> = "get"> = paths[P][M] extends {
  responses: { 200: infer Response }
}
  ? Response extends { content: { "application/json": infer Json } }
    ? Json extends { data?: (infer Data) | null }
      ? Data
      : Json
    : never
  : never

import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Script
     *
     * backend api module: "script"
     */
    namespace Script {
      /** script language */
      type ScriptLanguage = "python" | "javascript" | "shell"

      /** script list item (without code field) */
      type ScriptListItem = Common.CommonRecord<{
        name: string
        description: string
        language: string
      }>

      /** script detail */
      type ScriptDetail = Service.ApiResponse<"/api/v1/scripts/{script_id}">

      /** script search params */
      type ScriptSearchParams = Service.ApiRequest<"/api/v1/scripts", "get", "query">

      /** script list */
      type ScriptList = Service.ApiResponse<"/api/v1/scripts">

      /** script create payload */
      type ScriptCreate = Service.ApiRequest<"/api/v1/scripts", "post", "body">

      /** script update payload */
      type ScriptUpdate = Service.ApiRequest<"/api/v1/scripts/{script_id}", "put", "body">

      /** script create/update payload */
      type ScriptEdit = {
        name: string
        description?: string
        language: ScriptLanguage
        code?: string
        status?: Common.EnableStatus
      }

      /** script execute result */
      type ScriptExecuteResult = Service.ApiResponse<"/api/v1/scripts/{script_id}/execute", "post">
    }
  }
}

import { request } from "../request"

/** get script list (paginated) */
export function fetchGetScriptList(params?: Api.Script.ScriptSearchParams) {
  return request<Api.Script.ScriptList>({
    url: "/scripts",
    method: "get",
    params,
  })
}

/** get script detail (includes code) */
export function fetchGetScriptDetail(id: string) {
  return request<Api.Script.ScriptDetail>({
    url: `/scripts/${id}`,
    method: "get",
  })
}

/** create script */
export function fetchCreateScript(data: Api.Script.ScriptEdit) {
  return request<Api.Script.ScriptDetail>({
    url: "/scripts",
    method: "post",
    data,
  })
}

/** update script */
export function fetchUpdateScript(id: string, data: Api.Script.ScriptEdit) {
  return request<Api.Script.ScriptDetail>({
    url: `/scripts/${id}`,
    method: "put",
    data,
  })
}

/** delete script */
export function fetchDeleteScript(id: string) {
  return request<boolean>({
    url: `/scripts/${id}`,
    method: "delete",
  })
}

/** batch delete scripts */
export function fetchBatchDeleteScripts(ids: string[]) {
  return request<boolean>({
    url: "/scripts",
    method: "delete",
    data: { ids },
  })
}

/** execute script */
export function fetchExecuteScript(id: string) {
  return request<Api.Script.ScriptExecuteResult>({
    url: `/scripts/${id}/execute`,
    method: "post",
  })
}

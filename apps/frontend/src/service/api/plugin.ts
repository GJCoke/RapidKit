import { request } from "../request"

/** 获取所有插件状态列表 */
export function fetchPluginList() {
  return request<Api.Plugin.StatusItem[]>({
    url: "/system/plugins",
    method: "get",
  })
}

/** 获取插件依赖关系图 */
export function fetchPluginDependencies() {
  return request<Api.Plugin.DependencyGraph>({
    url: "/system/plugins/dependencies",
    method: "get",
  })
}

/** 获取 EventBus 统计信息 */
export function fetchPluginEvents() {
  return request<Api.Plugin.EventStats>({
    url: "/system/events",
    method: "get",
  })
}

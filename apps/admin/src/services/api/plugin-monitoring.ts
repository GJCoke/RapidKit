import { request } from "@/services/request"
import type { ApiResponse } from "@/typings/service"
export type PluginList = ApiResponse<"/api/v1/system/plugins">
export type PluginStatusItem = PluginList[number]
export type PluginDependencyGraph = ApiResponse<"/api/v1/system/plugins/dependencies">
export type PluginEvents = ApiResponse<"/api/v1/system/events">
export function fetchPluginList(signal?: AbortSignal) {
  return request<PluginList>({ url: "/system/plugins", method: "get", signal })
}
export function fetchPluginDependencies(signal?: AbortSignal) {
  return request<PluginDependencyGraph>({ url: "/system/plugins/dependencies", method: "get", signal })
}
export function fetchPluginEvents(signal?: AbortSignal) {
  return request<PluginEvents>({ url: "/system/events", method: "get", signal })
}

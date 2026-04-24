import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace Plugin {
      type Status = "loaded" | "disabled" | "failed" | "degraded"
      type PluginError = {
        phase: string
        message: string
        causedBy: string | null
      }

      type StatusItem = {
        name: string
        version: string | null
        status: Status
        required: boolean | null
        dependencies: string[] | null
        loadTimeMs: number | null
        startupTimeMs: number | null
        error?: PluginError
      }

      type PluginNode = {
        name: string
        version: string | null
        status: Status
        required: boolean
      }

      type PluginEdge = {
        source: string
        target: string
      }

      type DependencyGraph = Service.ApiResponse<"/api/v1/system/plugins/dependencies">

      type DeadLetter = {
        eventName: string
        timestamp: string
        source: string | null
      }

      type EventStats = Service.ApiResponse<"/api/v1/system/events">
    }
  }
}

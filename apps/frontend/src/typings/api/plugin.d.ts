declare global {
  namespace Api {
    namespace Plugin {
      type Status = "loaded" | "disabled" | "failed" | "degraded"
      type HealthStatus = "healthy" | "degraded" | "unhealthy"

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
        health: HealthStatus | null
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

      type DependencyGraph = {
        nodes: PluginNode[]
        edges: PluginEdge[]
      }

      type DeadLetter = {
        eventName: string
        timestamp: string
        source: string | null
      }

      type EventStats = {
        handlerErrors: Record<string, number>
        deadLetters: DeadLetter[]
        deadLetterCount: number
      }
    }
  }
}
export {}

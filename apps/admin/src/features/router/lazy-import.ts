const pageModules = typeof import.meta.glob === "function" ? import.meta.glob("@/views/**/index.tsx") : {}

export type BackendComponent = { kind: "container" } | { kind: "view"; viewPath: string }

export function parseBackendComponent(component?: string): BackendComponent {
  const view = component
    ?.split("$")
    .find((part) => part.startsWith("view."))
    ?.slice("view.".length)
  if (!view) return { kind: "container" }
  return { kind: "view", viewPath: view.replaceAll("_", "/").replaceAll(".", "/") }
}

export function lazyImport(component: string): () => Promise<{ default: React.ComponentType }> {
  const parsed = parseBackendComponent(component)
  if (parsed.kind === "container") return () => import("./route-container")

  const path = `/src/views/${parsed.viewPath}/index.tsx`
  const module = pageModules[path]

  if (!module) {
    console.warn(`[Router] View not found: ${path}`)
    return () => import("@/shared/pages/404")
  }

  return module as () => Promise<{ default: React.ComponentType }>
}

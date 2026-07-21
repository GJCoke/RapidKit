const pageModules = import.meta.glob("@/views/**/index.tsx")

export function lazyImport(component: string): () => Promise<{ default: React.ComponentType }> {
  const path = `/src/views/${component}/index.tsx`
  const module = pageModules[path]

  if (!module) {
    console.warn(`[Router] View not found: ${path}`)
    return () => import("@/shared/pages/404")
  }

  return module as () => Promise<{ default: React.ComponentType }>
}

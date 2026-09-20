import { canonicalizePathSearch } from "./route-url"

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /loading chunk [\w-]+ failed/i,
  /importing a module script failed/i,
]

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message))
}

function markerKey(pathSearch: string, buildId: string) {
  const url = new URL(pathSearch, "http://rapidkit.local")
  return `admin:chunk-reload:${buildId}:${canonicalizePathSearch(url.pathname, url.search)}`
}

export function shouldReloadChunk(
  error: unknown,
  pathSearch: string,
  buildId: string,
  storage: Storage = sessionStorage,
): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    const key = markerKey(pathSearch, buildId)
    if (storage.getItem(key)) return false
    storage.setItem(key, "1")
    return true
  } catch {
    return false
  }
}

export function clearChunkReloadMarker(pathSearch: string, buildId: string, storage: Storage = sessionStorage) {
  try {
    storage.removeItem(markerKey(pathSearch, buildId))
  } catch {
    // Storage can be unavailable in privacy modes; a stale marker is harmless.
  }
}

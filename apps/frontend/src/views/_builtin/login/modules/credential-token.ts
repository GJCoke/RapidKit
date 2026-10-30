/** Credentials live in memory, never in router URLs, storage or diagnostic requests. */
export function extractCredential(value: string): { token: string; url: string } {
  const url = new URL(value)
  const hashRoute = url.hash.startsWith("#/")
  const route = hashRoute ? new URL(url.hash.slice(1), url.origin) : url
  if (!/\/login\/(reset-password|set-password)\/?$/.test(route.pathname)) return { token: "", url: value }
  const fragment = hashRoute ? new URLSearchParams() : new URLSearchParams(url.hash.slice(1))
  const tokens = fragment.has("token") ? fragment.getAll("token") : route.searchParams.getAll("token")
  if (!tokens.length) return { token: "", url: value }
  const token = tokens.length === 1 && tokens[0]!.length <= 4096 ? tokens[0]! : ""
  fragment.delete("token")
  route.searchParams.delete("token")
  if (hashRoute) url.hash = route.pathname + route.search
  else url.hash = fragment.toString()
  return { token, url: url.toString() }
}

let credential = ""

export function captureCredential() {
  const extracted = extractCredential(window.location.href)
  credential = extracted.token
  if (extracted.url !== window.location.href) window.history.replaceState(window.history.state, "", extracted.url)
}

export function getCredentialToken(): string {
  return credential
}

if (typeof window !== "undefined") captureCredential()

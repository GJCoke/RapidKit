/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadLocaleMessages() {
  const modules = import.meta.glob("./langs/**/*.json", {
    eager: true,
  })
  const messages: Record<string, any> = {}

  for (const path in modules) {
    const match = path.match(/langs\/(.+?)\/(.+?)\.json$/)
    if (!match) continue

    const [_, locale, fileName] = match

    messages[locale] ??= {}
    messages[locale][fileName] = (modules[path] as any).default
  }

  return messages
}

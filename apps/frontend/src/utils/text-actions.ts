/** Keep downloaded files within a plain filename; never use user content as a path. */
export function safeFilename(filename: string, fallback: string): string {
  const name = Array.from(filename)
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .replace(/[\\/<>:"|?*]/g, "")
    .trim()
  return name && !/^\.+$/.test(name) ? name : fallback
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
  await navigator.clipboard.writeText(text)
}

export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const anchor = document.createElement("a")
  try {
    anchor.href = url
    anchor.download = safeFilename(filename, "download.txt")
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

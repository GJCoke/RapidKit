export interface SerializedJson {
  valid: boolean
  code: string
}

function validateJson(value: unknown, ancestors = new WeakSet<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (typeof value !== "object" || value === null) throw new TypeError("Unsupported JSON value")
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Unsupported JSON object")
  }
  if (ancestors.has(value) || typeof (value as { toJSON?: unknown }).toJSON === "function") {
    throw new TypeError("Unsupported JSON conversion")
  }
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, ancestors)
  } else {
    for (const key of Object.keys(value)) validateJson((value as Record<string, unknown>)[key], ancestors)
  }
  ancestors.delete(value)
}

/** Serialize actual values without guessing whether strings contain encoded JSON. */
export function serializeJson(value: unknown): SerializedJson {
  try {
    validateJson(value)
    const code = JSON.stringify(
      value,
      (_key, item: unknown) => {
        if (
          ["undefined", "function", "symbol", "bigint"].includes(typeof item) ||
          (typeof item === "number" && !Number.isFinite(item))
        ) {
          throw new TypeError("Unsupported JSON value")
        }
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const prototype = Object.getPrototypeOf(item)
          if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Unsupported JSON object")
        }
        return item
      },
      2,
    )
    return typeof code === "string" ? { valid: true, code } : { valid: false, code: "" }
  } catch {
    return { valid: false, code: "" }
  }
}

export type CodeLanguage = "python" | "json"
export interface CodeToken {
  text: string
  kind: "plain" | "string" | "number" | "keyword" | "property" | "punctuation"
}

/** Highlight generated preview text without interpreting it or inserting HTML. */
export function tokenizeCode(source: string, language: CodeLanguage): CodeToken[] {
  const pattern =
    /"(?:\\.|[^"\\])*"|[_\p{ID_Start}][_\p{ID_Continue}]*(?=\s*=)|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:True|False|None|true|false|null)\b|[{}[\]():,*=]/gu
  const tokens: CodeToken[] = []
  let position = 0
  for (const match of source.matchAll(pattern)) {
    const start = match.index
    if (start > position) tokens.push({ text: source.slice(position, start), kind: "plain" })
    const text = match[0]
    let kind: CodeToken["kind"] = "punctuation"
    if (text.startsWith('"')) kind = /^\s*:/.test(source.slice(start + text.length)) ? "property" : "string"
    else if (language === "python" && /^\s*=/.test(source.slice(start + text.length))) kind = "property"
    else if (/^-?\d/.test(text)) kind = "number"
    else if (/^[A-Za-z]/.test(text))
      kind = (language === "python" ? ["True", "False", "None"] : ["true", "false", "null"]).includes(text)
        ? "keyword"
        : "plain"
    tokens.push({ text, kind })
    position = start + text.length
  }
  if (position < source.length) tokens.push({ text: source.slice(position), kind: "plain" })
  return tokens
}

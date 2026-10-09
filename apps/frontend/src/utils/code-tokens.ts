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

export type ArgumentType = "string" | "number" | "boolean" | "none" | "json"
export interface ArgumentRow {
  type: ArgumentType
  value: string
}
export interface KeywordRow extends ArgumentRow {
  key: string
}
export interface PythonArguments {
  args: unknown[]
  kwargs: Record<string, unknown>
}
export type ArgumentErrorCode = "number" | "boolean" | "json" | "key" | "duplicate"
export class ArgumentError extends Error {
  constructor(
    public code: ArgumentErrorCode,
    public group?: "args" | "kwargs",
    public index?: number,
  ) {
    super(code)
  }
}

function checkNumbers(value: unknown): void {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    throw new ArgumentError("number")
  }
  if (Array.isArray(value)) value.forEach(checkNumbers)
  else if (value && typeof value === "object") Object.values(value).forEach(checkNumbers)
}

function parseValue(row: ArgumentRow): unknown {
  if (row.type === "string") return row.value
  if (row.type === "none") return null
  if (row.type === "boolean") {
    if (row.value !== "true" && row.value !== "false") throw new ArgumentError("boolean")
    return row.value === "true"
  }
  if (row.type === "number") {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(row.value.trim())) throw new ArgumentError("number")
    const value = Number(row.value)
    checkNumbers(value)
    return value
  }
  let value: unknown
  try {
    value = JSON.parse(row.value)
  } catch {
    throw new ArgumentError("json")
  }
  checkNumbers(value)
  return value
}

export function encodeArguments(args: ArgumentRow[], kwargs: KeywordRow[]): PythonArguments {
  const keys = new Set<string>()
  const locate = <T>(group: "args" | "kwargs", index: number, parse: () => T): T => {
    try {
      return parse()
    } catch (error) {
      if (error instanceof ArgumentError) throw new ArgumentError(error.code, group, index)
      throw error
    }
  }
  const values = args.map((row, index) => locate("args", index, () => parseValue(row)))
  const entries = kwargs.map((row, index) =>
    locate("kwargs", index, (): [string, unknown] => {
      if (!row.key.trim()) throw new ArgumentError("key")
      if (keys.has(row.key)) throw new ArgumentError("duplicate")
      keys.add(row.key)
      return [row.key, parseValue(row)]
    }),
  )
  return { args: values, kwargs: Object.fromEntries(entries) }
}

function decodeValue(value: unknown): ArgumentRow {
  if (value === null) return { type: "none", value: "" }
  if (typeof value === "string") return { type: "string", value }
  if (typeof value === "number") return { type: "number", value: String(value) }
  if (typeof value === "boolean") return { type: "boolean", value: String(value) }
  return { type: "json", value: JSON.stringify(value, null, 2) }
}

export function decodeArguments(value: PythonArguments): { args: ArgumentRow[]; kwargs: KeywordRow[] } {
  return {
    args: value.args.map(decodeValue),
    kwargs: Object.entries(value.kwargs).map(([key, val]) => ({ key, ...decodeValue(val) })),
  }
}

export function formatPython(value: unknown): string {
  if (value === null) return "None"
  if (value === true) return "True"
  if (value === false) return "False"
  if (Array.isArray(value)) return `[${value.map(formatPython).join(", ")}]`
  if (typeof value === "object" && value)
    return `{${Object.entries(value)
      .map(([key, val]) => `${JSON.stringify(key)}: ${formatPython(val)}`)
      .join(", ")}}`
  return JSON.stringify(value) ?? String(value)
}

function formatPythonBlock(value: unknown, depth: number): string {
  const indent = "  ".repeat(depth)
  const childIndent = "  ".repeat(depth + 1)
  if (Array.isArray(value) && value.length) {
    return `[\n${value.map((item) => `${childIndent}${formatPythonBlock(item, depth + 1)},`).join("\n")}\n${indent}]`
  }
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) {
    return `{\n${Object.entries(value)
      .map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${formatPythonBlock(item, depth + 1)},`)
      .join("\n")}\n${indent}}`
  }
  return formatPython(value)
}

const pythonKeywords = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
)

function canUseKeywordName(key: string): boolean {
  // Python normalizes source identifiers; retain the original mapping key if that would change it.
  return key.normalize("NFKC") === key && /^[_\p{ID_Start}][_\p{ID_Continue}]*$/u.test(key) && !pythonKeywords.has(key)
}

export function formatPythonCall(functionName: string, value: PythonArguments): string {
  const keywords = Object.entries(value.kwargs)
  const keyword = (key: string, item: unknown, format: (item: unknown) => string) =>
    canUseKeywordName(key) ? `${key}=${format(item)}` : `**${format({ [key]: item })}`
  if (!value.args.length && !keywords.length) return `${functionName}()`

  const block = (item: unknown) => formatPythonBlock(item, 1)
  const lines = [...value.args.map(block), ...keywords.map(([key, item]) => keyword(key, item, block))]
  return `${functionName}(\n${lines.map((line) => `  ${line},`).join("\n")}\n)`
}

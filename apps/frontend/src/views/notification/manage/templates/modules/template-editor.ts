export const variableTypes = ["string", "integer", "number", "boolean"] as const
export type VariableType = (typeof variableTypes)[number]
export type VariableSchema = Record<string, Record<string, unknown>>

export interface VariableRow {
  id: number
  name: string
  type: VariableType
  required: boolean
  example: string
  rule: Record<string, unknown>
}

export type PreviewIssueKind =
  | "undeclared"
  | "missingExample"
  | "invalidExample"
  | "unsupportedFormat"
  | "invalidFormat"
export interface PreviewIssue {
  kind: PreviewIssueKind
  name: string
}

let nextRowId = 0

export function createVariableRow(): VariableRow {
  return { id: nextRowId++, name: "", type: "string", required: true, example: "", rule: {} }
}

export function parseVariableSchema(text: string): VariableSchema {
  const schema: unknown = JSON.parse(text)
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("invalidSchema")
  for (const [name, rule] of Object.entries(schema)) {
    if (!name.trim() || !rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error("invalidSchema")
    const { type = "string", required = false } = rule as Record<string, unknown>
    if (!variableTypes.includes(type as VariableType) || typeof required !== "boolean") throw new Error("invalidSchema")
  }
  return schema as VariableSchema
}

export function schemaToRows(schema: VariableSchema, previous: VariableRow[] = []): VariableRow[] {
  return Object.entries(schema).map(([name, rule]) => {
    const previousRow = previous.find((row) => row.name === name)
    const example = rule.example ?? (Array.isArray(rule.examples) ? rule.examples[0] : undefined)
    return {
      id: previousRow?.id ?? nextRowId++,
      name,
      type: (rule.type ?? "string") as VariableType,
      required: Boolean(rule.required),
      example: ["string", "number", "boolean"].includes(typeof example) ? String(example) : "",
      rule: { ...rule },
    }
  })
}

export function rowsToSchema(rows: VariableRow[]): VariableSchema {
  const names = new Set<string>()
  return Object.fromEntries(
    rows.map((row) => {
      const name = row.name
      if (!name.trim() || names.has(name)) throw new Error("invalidSchema")
      names.add(name)
      const rule = { ...row.rule }
      if (Object.hasOwn(rule, "type") || row.type !== "string") rule.type = row.type
      if (Object.hasOwn(rule, "required") || row.required) rule.required = row.required
      const example = exampleValue(row)
      if (example !== undefined) rule.example = example
      else if (Object.hasOwn(rule, "example") || Array.isArray(rule.examples)) rule.example = ""
      return [name, rule]
    }),
  )
}

export function exampleValue(row: VariableRow): string | number | boolean | undefined {
  if (row.example === "") return undefined
  const value = row.example.trim()
  if (row.type === "string") return row.example
  if (row.type === "boolean") {
    if (value === "true") return true
    if (value === "false") return false
    throw new Error("invalidExample")
  }
  const number = Number(value)
  if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(number)) {
    throw new Error("invalidExample")
  }
  if (row.type === "integer" && (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(number))) {
    throw new Error("invalidExample")
  }
  return number
}

/** Preview only simple Python-style fields; never evaluate expressions or render HTML. */
export function previewTemplate(template: string, rows: VariableRow[]): { text: string; issues: PreviewIssue[] } {
  const variables = new Map(rows.map((row) => [row.name, row]))
  const issues: PreviewIssue[] = []
  let text = ""
  let index = 0
  while (index < template.length) {
    const character = template[index]!
    if (template.slice(index, index + 2) === "{{" || template.slice(index, index + 2) === "}}") {
      text += character
      index += 2
      continue
    }
    if (character === "{") {
      let end = -1
      let depth = 1
      for (let cursor = index + 1; cursor < template.length; cursor++) {
        if (template[cursor] === "{") depth++
        if (template[cursor] === "}") depth--
        if (depth === 0) {
          end = cursor
          break
        }
      }
      const name = template.slice(index + 1, end < 0 ? template.length : end)
      const token = template.slice(index, end < 0 ? template.length : end + 1)
      const row = variables.get(name)
      let replacement = token
      if (end < 0) {
        issues.push({ kind: "invalidFormat", name: token })
      } else if (!/^[a-zA-Z_]\w*$/.test(name)) {
        issues.push({ kind: "unsupportedFormat", name: token })
      } else if (!row) {
        issues.push({ kind: "undeclared", name })
      } else {
        try {
          const value = exampleValue(row)
          if (value === undefined) issues.push({ kind: "missingExample", name })
          else replacement = typeof value === "boolean" ? (value ? "True" : "False") : String(value)
        } catch {
          issues.push({ kind: "invalidExample", name })
        }
      }
      text += replacement
      index = end < 0 ? template.length : end + 1
    } else {
      if (character === "}") issues.push({ kind: "invalidFormat", name: character })
      text += character
      index++
    }
  }
  return { text, issues }
}

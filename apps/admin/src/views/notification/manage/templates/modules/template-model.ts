import { formatTemplateText } from "@/features/notifications/template-preview"
import type {
  NotificationTemplate,
  CreateNotificationTemplateBody,
  UpdateNotificationTemplateBody,
} from "@/services/api/notification-template"
export const templateVariableTypes = ["string", "integer", "number", "boolean"] as const
export interface TemplateVariableRow {
  name: string
  type: string
  required: boolean
  example: string
  rule: Record<string, unknown>
}
export interface TemplateForm {
  code: string
  name: string
  category: string
  level: NotificationTemplate["level"]
  contentMode: NotificationTemplate["contentMode"]
  titleTemplate: string
  contentTemplate: string
  contentFormat: NotificationTemplate["contentFormat"]
  mandatory: boolean
  enabled: boolean
  variables: TemplateVariableRow[]
  schemaJson: string | null
}
export type TemplatePreviewIssue = {
  kind:
    | "undeclared"
    | "missingExample"
    | "invalidExample"
    | "unsupportedFormat"
    | "invalidFormat"
    | "translationMissing"
  name: string
}
export class TemplateValidationError extends Error {
  constructor(
    public key: string,
    public params: Record<string, unknown> = {},
  ) {
    super(key)
  }
}
function invalid(key = "schemaInvalid", params: Record<string, unknown> = {}): never {
  throw new TemplateValidationError(key, params)
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
export function emptyTemplateForm(): TemplateForm {
  return {
    code: "",
    name: "",
    category: "",
    level: "info",
    contentMode: "raw",
    titleTemplate: "",
    contentTemplate: "",
    contentFormat: "plain_text",
    mandatory: false,
    enabled: true,
    variables: [],
    schemaJson: null,
  }
}
export function parseTemplateSchema(text: string): NotificationTemplate["variableSchema"] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    invalid()
  }
  if (!record(value)) invalid()
  return Object.fromEntries(
    Object.entries(value).map(([name, rule]) => {
      if (!name.trim() || !record(rule)) invalid()
      if (rule.type !== undefined && !templateVariableTypes.some((type) => type === rule.type)) invalid()
      if (rule.required !== undefined && typeof rule.required !== "boolean") invalid()
      return [name, { ...rule }]
    }),
  )
}
export function templateSchemaRows(schema: NotificationTemplate["variableSchema"]): TemplateVariableRow[] {
  return Object.entries(schema).map(([name, rule]) => {
    const example = rule.example ?? (Array.isArray(rule.examples) ? rule.examples[0] : undefined)
    return {
      name,
      type: typeof rule.type === "string" ? rule.type : "string",
      required: Boolean(rule.required),
      example:
        typeof example === "string" || typeof example === "number" || typeof example === "boolean"
          ? String(example)
          : "",
      rule: { ...rule },
    }
  })
}
export function templateExample(row: TemplateVariableRow): string | number | boolean | undefined {
  if (row.example === "") {
    const original = row.rule.example ?? (Array.isArray(row.rule.examples) ? row.rule.examples[0] : undefined)
    if (original !== undefined && original !== null && !["string", "number", "boolean"].includes(typeof original))
      invalid()
    return undefined
  }
  const value = row.example.trim()
  if (row.type === "string") return row.example
  if (row.type === "boolean") {
    if (value === "true") return true
    if (value === "false") return false
    return invalid()
  }
  const number = Number(value)
  if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(number)) invalid()
  if (row.type === "integer" && (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(number))) invalid()
  if (row.type !== "integer" && row.type !== "number") invalid()
  return number
}
export function templateRowsSchema(rows: TemplateVariableRow[]): NotificationTemplate["variableSchema"] {
  const seen = new Set<string>()
  const schema = Object.fromEntries(
    rows.map((row) => {
      if (!row.name.trim() || seen.has(row.name)) invalid()
      seen.add(row.name)
      const rule = { ...row.rule }
      if (Object.hasOwn(rule, "type") || row.type !== "string") rule.type = row.type
      if (Object.hasOwn(rule, "required") || row.required) rule.required = row.required
      const example = templateExample(row)
      if (example !== undefined) {
        const original = row.rule.example ?? (Array.isArray(row.rule.examples) ? row.rule.examples[0] : undefined)
        const unchangedImplicit =
          row.rule.type === undefined &&
          row.type === "string" &&
          original !== undefined &&
          original !== null &&
          ["string", "number", "boolean"].includes(typeof original) &&
          row.example === String(original)
        rule.example = unchangedImplicit ? original : example
      } else if ((Object.hasOwn(rule, "example") || Array.isArray(rule.examples)) && rule.example !== null)
        rule.example = ""
      return [row.name, rule]
    }),
  )
  return parseTemplateSchema(JSON.stringify(schema))
}
export function templateFormRows(form: TemplateForm): TemplateVariableRow[] {
  return form.schemaJson === null ? form.variables : templateSchemaRows(parseTemplateSchema(form.schemaJson))
}
export function restoreTemplateForm(row: NotificationTemplate): TemplateForm {
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    level: row.level,
    contentMode: row.contentMode,
    titleTemplate: row.titleTemplate,
    contentTemplate: row.contentTemplate,
    contentFormat: row.contentFormat ?? null,
    mandatory: row.mandatory,
    enabled: row.enabled,
    variables: templateSchemaRows(row.variableSchema),
    schemaJson: null,
  }
}
export function templatePreview(
  template: Pick<TemplateForm, "contentMode" | "titleTemplate" | "contentTemplate">,
  rows: TemplateVariableRow[],
  translate: (key: string, params?: Record<string, string | number | boolean>) => string,
): { title: string; content: string; issues: TemplatePreviewIssue[] } {
  const issues: TemplatePreviewIssue[] = [],
    values: Record<string, string | number | boolean> = Object.fromEntries(
      rows.flatMap<[string, string | number | boolean]>((row) => {
        try {
          const value = templateExample(row)
          return value === undefined ? [] : [[row.name, value]]
        } catch {
          return []
        }
      }),
    )
  if (template.contentMode === "i18n") {
    for (const row of rows) {
      try {
        if (templateExample(row) === undefined && row.required) issues.push({ kind: "missingExample", name: row.name })
      } catch {
        issues.push({ kind: "invalidExample", name: row.name })
      }
    }
    const render = (key: string) => {
      if (!key) return ""
      const text = translate(key, values)
      if (text === key) issues.push({ kind: "translationMissing", name: key })
      return text
    }
    return {
      title: render(template.titleTemplate),
      content: render(template.contentTemplate),
      issues: uniqueIssues(issues),
    }
  }
  const render = (text: string) => {
    const result = formatTemplateText(text, values)
    for (const name of result.issues) {
      if (/^[A-Za-z_]\w*$/.test(name)) {
        const row = rows.find((row) => row.name === name)
        if (!row) issues.push({ kind: "undeclared", name })
        else {
          try {
            templateExample(row)
            issues.push({ kind: "missingExample", name })
          } catch {
            issues.push({ kind: "invalidExample", name })
          }
        }
      } else {
        const balance = Array.from(name).reduce((depth, char) => depth + (char === "{" ? 1 : char === "}" ? -1 : 0), 0)
        issues.push({
          kind: name.startsWith("{") && name.endsWith("}") && balance === 0 ? "unsupportedFormat" : "invalidFormat",
          name,
        })
      }
    }
    return result.text
  }
  return {
    title: render(template.titleTemplate),
    content: render(template.contentTemplate),
    issues: uniqueIssues(issues),
  }
}
function uniqueIssues(issues: TemplatePreviewIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = JSON.stringify(issue)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
export function buildTemplatePayload(form: TemplateForm): CreateNotificationTemplateBody
export function buildTemplatePayload(form: TemplateForm, original: NotificationTemplate): UpdateNotificationTemplateBody
export function buildTemplatePayload(
  form: TemplateForm,
  original?: NotificationTemplate,
): CreateNotificationTemplateBody | UpdateNotificationTemplateBody {
  const mode = original?.contentMode ?? form.contentMode,
    code = original?.code ?? form.code
  for (const [value, limit] of [
    [form.name, 128],
    [code, 128],
    [form.category, 128],
    [form.titleTemplate, 512],
    [form.contentTemplate, 20000],
  ] as const)
    if (!value.trim() || Array.from(value).length > limit) invalid("formInvalid")
  const rows = templateFormRows(form),
    variableSchema = templateRowsSchema(rows)
  if (mode === "i18n") {
    if (
      [form.titleTemplate, form.contentTemplate].some(
        (value) => !/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)+$/.test(value),
      )
    )
      invalid("i18nInvalid")
  } else {
    const issue = templatePreview({ ...form, contentMode: mode }, rows, (key) => key).issues.find(
      (issue) => issue.kind === "undeclared" || issue.kind === "invalidFormat",
    )
    if (issue) invalid(issue.kind, { name: issue.name })
  }
  const body = {
    name: form.name.trim(),
    category: form.category.trim(),
    level: form.level,
    titleTemplate: form.titleTemplate,
    contentTemplate: form.contentTemplate,
    contentFormat: form.contentFormat ?? null,
    variableSchema,
    defaultChannels: original?.defaultChannels ?? ["in_app" as const],
    mandatory: form.mandatory,
    enabled: form.enabled,
  }
  return original ? body : { ...body, code: code.trim(), contentMode: mode }
}
export function insertTemplateVariable(value: string, selection: { start: number; end: number }, name: string) {
  const start = Math.max(0, Math.min(value.length, selection.start)),
    end = Math.max(start, Math.min(value.length, selection.end)),
    token = `{${name}}`
  return { value: value.slice(0, start) + token + value.slice(end), cursor: start + token.length }
}

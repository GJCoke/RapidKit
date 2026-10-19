export interface ActionContext {
  ready: boolean
  hasAuth: (code: PermissionCode) => boolean
  actorId: string
  isAdmin: boolean
  impersonating: boolean
  locale: string
  isMobile?: boolean
}

export type ActionAccess =
  | { kind: "page" }
  | { kind: "any"; codes: readonly PermissionCode[] }
  | { kind: "all"; codes: readonly PermissionCode[] }
  | { kind: "predicate"; test: (context: ActionContext) => boolean }

export interface ActionDefinition<Row> {
  key: string
  access: ActionAccess
  width: number | ((context: ActionContext) => number)
  available?: (context: ActionContext) => boolean
  visible?: (row: Row, context: ActionContext) => boolean
  disabled?: (row: Row, context: ActionContext) => boolean
}

export type ActionEntry =
  | { kind: "action"; key: string }
  | { kind: "choice"; key: string; actions: readonly string[] }
  | { kind: "menu"; key: string; actions: readonly string[]; width: number | ((context: ActionContext) => number) }

export interface ActionLayout<Row> {
  key: string
  matches: (row: Row, context: ActionContext) => boolean
  available?: (context: ActionContext) => boolean
  entries: readonly ActionEntry[]
}

export interface ActionModel<Row> {
  actions: readonly ActionDefinition<Row>[]
  layouts: readonly ActionLayout<Row>[]
}

export interface ResolvedEntry {
  key: string
  kind: ActionEntry["kind"]
  width: number
  actions: string[]
}

export type LogicType = "AND" | "OR"
export type OperatorType = Api.DataPolicy.Operator

export type ConditionNode = Api.DataPolicy.Condition
export type GroupNode = Api.DataPolicy.ConditionGroup
export type SubqueryNode = Api.DataPolicy.SubqueryCondition
export type RuleNode = GroupNode | ConditionNode | SubqueryNode

export interface ModelOption {
  name: string
  label: string
  fields: FieldOption[]
}

export interface FieldOption {
  name: string
  label: string
  type: string
}

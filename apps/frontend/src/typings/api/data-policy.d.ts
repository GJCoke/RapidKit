declare global {
  namespace Api {
    namespace DataPolicy {
      type ConditionGroup = {
        type: "group"
        logic: "AND" | "OR"
        conditions: (ConditionGroup | Condition | SubqueryCondition)[]
      }

      type Condition = {
        type: "condition"
        field: string
        operator: Operator
        value?: string | string[]
      }

      type SubqueryCondition = {
        type: "subquery"
        field: string
        operator: "in" | "not_in"
        model: string
        target_field: string
        filter: ConditionGroup
      }

      type Operator = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "in" | "not_in" | "is_null" | "is_not_null" | "between"

      type RuleTree = ConditionGroup

      type Policy = {
        id: string
        name: string
        targetModel: string
        description: string
        rule: RuleTree
        status: Api.Common.EnableStatus
        effect: 'allow' | 'deny'
        actions: ('read' | 'write')[]
        createTime: string
        updateTime: string
      }

      type PolicyCreate = {
        name: string
        targetModel: string
        description?: string
        rule: RuleTree
        status?: Api.Common.EnableStatus
        effect?: 'allow' | 'deny'
        actions?: ('read' | 'write')[]
      }

      type PolicyUpdate = Partial<PolicyCreate>

      type ModelField = {
        name: string
        label: string
        type: string
      }

      type ModelMetadata = {
        name: string
        label: string
        fields: ModelField[]
      }

      type PolicySearchParams = {
        page?: number
        pageSize?: number
        keyword?: string
      }

      type PolicyList = Api.Common.PaginatingQueryRecord<Policy>

      type PolicyAppliedDetail = {
        policyId: string
        policyName: string
        matchedCount: number
        sqlFragment: string
      }

      type PolicySimulateRequest = {
        policyIds: string[]
        targetUserId: string
        previewLimit?: number
      }

      type PolicySimulateResponse = {
        targetModel: string
        targetModelLabel: string
        totalCount: number
        filteredCount: number
        excludedCount: number
        previewRows: Record<string, unknown>[]
        excludedRows: Record<string, unknown>[]
        generatedSql: string
        policiesApplied: PolicyAppliedDetail[]
        isAdminBypass: boolean
      }
    }
  }
}

export {}

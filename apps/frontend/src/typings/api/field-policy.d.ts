declare namespace Api {
  namespace FieldPolicy {
    type Effect = 'strip' | 'mask' | 'deny';

    interface Policy {
      id: string;
      name: string;
      targetModel: string;
      description: string;
      fields: string[];
      actions: ('read' | 'write')[];
      effect: Effect;
      condition: Api.DataPolicy.RuleTree | null;
      status: Api.Common.EnableStatus;
      createTime: string;
      updateTime: string;
    }

    interface PolicyCreate {
      name: string;
      targetModel: string;
      description?: string;
      fields: string[];
      actions?: ('read' | 'write')[];
      effect: Effect;
      condition?: Api.DataPolicy.RuleTree | null;
      status?: Api.Common.EnableStatus;
    }

    type PolicyUpdate = Partial<PolicyCreate>;

    interface PolicySearchParams {
      page?: number;
      pageSize?: number;
      keyword?: string;
      targetModel?: string;
    }

    type PolicyList = Api.Common.PaginatingQueryRecord<Policy>;
  }
}

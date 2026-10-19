interface RoleUpdateSource {
  name: string
  code: string
  description: string
  status: Api.Common.EnableStatus | null
}

export function buildRoleUpdatePayload<T extends RoleUpdateSource>(source: T): Api.SystemManage.UpdateRoleBody {
  return {
    name: source.name,
    code: source.code,
    description: source.description,
    status: source.status!,
  }
}

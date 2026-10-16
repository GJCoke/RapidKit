/** A per-view projection only; no identity-specific data is cached here. */
export function createDepartmentMap(tree: Api.SystemManage.DepartmentTree[]): Record<string, string> {
  const map: Record<string, string> = {}
  function visit(nodes: Api.SystemManage.DepartmentTree[]) {
    for (const node of nodes) {
      map[node.id] = node.name
      if (node.children?.length) visit(node.children)
    }
  }
  visit(tree)
  return map
}

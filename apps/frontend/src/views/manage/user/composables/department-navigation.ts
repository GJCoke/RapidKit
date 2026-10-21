export function createDepartmentNavigationIndex(tree: Api.SystemManage.DepartmentTree[]) {
  const index = new Map<
    string,
    { department: Api.SystemManage.DepartmentTree; path: Api.SystemManage.DepartmentTree[] }
  >()
  function visit(nodes: Api.SystemManage.DepartmentTree[], ancestors: Api.SystemManage.DepartmentTree[]) {
    for (const department of nodes) {
      const path = [...ancestors, department]
      index.set(department.id, { department, path })
      visit(department.children ?? [], path)
    }
  }
  visit(tree, [])
  return index
}

import type { DepartmentTreeNode } from "@/services/api/department"
import type { UserDepartmentCounts } from "@/services/api/user"

export interface DepartmentDirectoryEntry {
  department: DepartmentTreeNode
  path: DepartmentTreeNode[]
  count: number | null
}
export type DepartmentDirectory = ReadonlyMap<string, DepartmentDirectoryEntry>

export function createDepartmentDirectory(tree: DepartmentTreeNode[], counts: UserDepartmentCounts | null) {
  const index = new Map<string, DepartmentDirectoryEntry>()
  function visit(nodes: DepartmentTreeNode[], ancestors: DepartmentTreeNode[]) {
    for (const department of nodes) {
      const path = [...ancestors, department]
      index.set(department.id, { department, path, count: null })
      visit(department.children ?? [], path)
    }
  }
  visit(tree, [])
  if (counts && Object.keys(counts.departments).every((id) => index.has(id))) {
    const sum = (department: DepartmentTreeNode): number => {
      const total =
        (counts.departments[department.id] ?? 0) +
        (department.children ?? []).reduce((value, child) => value + sum(child), 0)
      const entry = index.get(department.id)
      if (entry) entry.count = total
      return total
    }
    tree.forEach(sum)
  }
  return index
}
export function searchDepartments(index: DepartmentDirectory, keyword: string) {
  const needle = keyword.trim().toLocaleLowerCase()
  return [...index.values()].filter(({ department }) => department.name.toLocaleLowerCase().includes(needle))
}
export function departmentScopeForSelection(index: DepartmentDirectory, id: string) {
  const path = index.get(id)?.path
  return path && path.length > 3 ? path.at(-3)!.id : null
}
export function departmentBreadcrumbs(path: DepartmentTreeNode[]): Array<DepartmentTreeNode | null> {
  return path.length > 3 ? [path[0], null, path.at(-1)!] : path
}
export function isDepartmentDepthBoundary(path: DepartmentTreeNode[], scopePath: DepartmentTreeNode[]) {
  return path.length - 1 - Math.max(0, scopePath.length - 1) >= (scopePath.length ? 2 : 3)
}
export function retainedDepartmentScope(index: DepartmentDirectory, previousPath: DepartmentTreeNode[]) {
  return [...previousPath].reverse().find((department) => index.has(department.id))?.id ?? null
}

export function departmentParentChoices(index: DepartmentDirectory, editingId?: string) {
  return [...index.values()]
    .filter(({ path }) => !editingId || !path.some((department) => department.id === editingId))
    .map(({ department, path }) => ({ value: department.id, label: path.map((entry) => entry.name).join(" / ") }))
}

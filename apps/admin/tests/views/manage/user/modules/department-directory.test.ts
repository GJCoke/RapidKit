import { expect, test } from "vitest"
import type { DepartmentTreeNode } from "@/services/api/department"
import {
  createDepartmentDirectory,
  departmentParentChoices,
  searchDepartments,
  departmentScopeForSelection,
  departmentBreadcrumbs,
  isDepartmentDepthBoundary,
  retainedDepartmentScope,
} from "@/views/manage/user/modules/department-directory"
function node(id: string, children: DepartmentTreeNode[] = [], parentId: string | null = null): DepartmentTreeNode {
  return {
    id,
    parentId,
    name: `Department ${id}`,
    code: id,
    status: "1",
    sort: 0,
    createTime: "",
    updateTime: "",
    children,
  }
}
const tree = [
  node("a", [
    node("b", [node("c", [node("d", [node("e", [node("f", [node("g", [], "f")], "e")], "d")], "c")], "b")], "a"),
  ]),
  node("other"),
]
test("directory retains complete ancestry and sums only the direct counts once across each visible subtree", () => {
  const index = createDepartmentDirectory(tree, {
    total: 20,
    unassigned: 4,
    departments: { a: 1, b: 2, c: 3, g: 5, other: 5 },
  })
  expect(index.get("g")?.path.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"])
  expect(index.get("a")?.count).toBe(11)
  expect(index.get("b")?.count).toBe(10)
  expect(index.get("other")?.count).toBe(5)
  expect(index.get("d")?.count).toBe(5)
})
test("unavailable counts and counts for invisible departments do not claim knowable ancestor totals", () => {
  for (const counts of [null, { total: 2, unassigned: 0, departments: { invisible: 2 } }]) {
    const index = createDepartmentDirectory(tree, counts)
    expect(index.get("a")?.count).toBeNull()
    expect(index.get("g")?.count).toBeNull()
  }
})
test("search is case insensitive, returns the complete path and selecting deep results scopes to their last three levels", () => {
  const index = createDepartmentDirectory(tree, null)
  expect(searchDepartments(index, "  DEPARTMENT G ").map((x) => x.department.id)).toEqual(["g"])
  expect(searchDepartments(index, "unknown")).toEqual([])
  expect(departmentScopeForSelection(index, "g")).toBe("e")
  expect(departmentScopeForSelection(index, "b")).toBeNull()
  expect(departmentScopeForSelection(index, "missing")).toBeNull()
  expect(departmentBreadcrumbs(index.get("e")!.path).map((x) => x?.id ?? null)).toEqual(["a", null, "e"])
})
test("depth boundaries enter a new browsing scope and deleted scopes fall back to the nearest surviving ancestor", () => {
  const index = createDepartmentDirectory(tree, null)
  expect(isDepartmentDepthBoundary(index.get("c")!.path, [])).toBe(false)
  expect(isDepartmentDepthBoundary(index.get("d")!.path, [])).toBe(true)
  expect(isDepartmentDepthBoundary(index.get("f")!.path, index.get("d")!.path)).toBe(true)
  const remaining = createDepartmentDirectory([node("a", [node("b", [], "a")])], null)
  expect(retainedDepartmentScope(remaining, index.get("e")!.path)).toBe("b")
  expect(retainedDepartmentScope(new Map(), index.get("e")!.path)).toBeNull()
})

test("parent choices retain complete visible paths and exclude the edited department and all its descendants", () => {
  const index = createDepartmentDirectory(tree, null)
  expect(departmentParentChoices(index, "c").map((x) => x.value)).toEqual(["a", "b", "other"])
  expect(departmentParentChoices(index).find((x) => x.value === "c")?.label).toBe(
    "Department a / Department b / Department c",
  )
})

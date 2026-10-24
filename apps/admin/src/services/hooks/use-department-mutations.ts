import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  type CreateDepartmentBody,
  type UpdateDepartmentBody,
} from "@/services/api/department"
import { useDirectoryWrite } from "./use-directory-write"

export function useDepartmentMutations() {
  const create = useDirectoryWrite("department:create", (data: CreateDepartmentBody) => createDepartment(data))
  const update = useDirectoryWrite("department:update", ({ id, data }: { id: string; data: UpdateDepartmentBody }) =>
    updateDepartment(id, data),
  )
  const deletion = useDirectoryWrite("department:delete", (id: string) => deleteDepartment(id))
  return { create, update, deletion }
}

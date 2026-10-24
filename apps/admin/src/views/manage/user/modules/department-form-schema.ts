import { z } from "zod"
import type { CreateDepartmentBody } from "@/services/api/department"

export const departmentFormSchema = z.object({
  parentId: z.string(),
  name: z.string().trim().min(1, "users.department.validation.name").max(100, "users.department.validation.name"),
  code: z.string().trim().min(1, "users.department.validation.code").max(50, "users.department.validation.code"),
  sort: z.number({ invalid_type_error: "users.department.validation.sort" }).int("users.department.validation.sort"),
  status: z.enum(["1", "2", "3"], { errorMap: () => ({ message: "users.validation.status" }) }),
  leaderId: z.string(),
})
export type DepartmentFormValues = z.infer<typeof departmentFormSchema>
export function departmentPayload(values: DepartmentFormValues): CreateDepartmentBody {
  return { ...values, parentId: values.parentId || null, leaderId: values.leaderId || null }
}

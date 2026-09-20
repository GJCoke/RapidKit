import { z } from "zod"

const optionalText = z.string().max(255).optional().default("")
export const userFormSchema = z.object({
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(5).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(32).optional().default(""),
  avatar: optionalText,
  nickname: z.string().max(100).optional().default(""),
  gender: z.string().max(20).optional().default(""),
  status: z.enum(["1", "2", "3"]),
  roles: z.array(z.string()),
  isAdmin: z.boolean(),
  departmentId: z.string().optional().default(""),
  remark: z.string().max(500).optional().default(""),
})
export type UserFormValues = z.infer<typeof userFormSchema>

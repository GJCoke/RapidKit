import { useCallback, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import {
  Checkbox,
  FieldGroup,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@rapidkit/ui"
import type { User } from "@/services/api/user"
import { useCreateUser, useUpdateUser } from "@/services/hooks/use-user-mutations"
import { useDepartmentOptions, useRoleOptions } from "@/services/hooks/use-user-options"
import { CrudDrawer, FormField } from "@/shared/crud"
import { userFormSchema, type UserFormValues } from "./user-form-schema"
import { useUsernamePinyin } from "../hooks/use-username-pinyin"

const emptyValues: UserFormValues = {
  name: "",
  username: "",
  email: "",
  phone: "",
  avatar: "",
  nickname: "",
  gender: "",
  status: "1",
  roles: [],
  isAdmin: false,
  departmentId: "",
  remark: "",
}
const genderItems = [
  { value: "none", label: "未设置" },
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "其他" },
]
const statusItems = [
  { value: "1", label: "正常" },
  { value: "2", label: "禁用" },
  { value: "3", label: "待激活" },
]

function flattenDepartments(
  nodes: Array<{ id: string; name: string; children: unknown[] }>,
  depth = 0,
): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenDepartments(node.children as Array<{ id: string; name: string; children: unknown[] }>, depth + 1),
  ])
}

export function UserOperateDrawer({
  open,
  onOpenChange,
  user,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  onSuccess: () => void
}) {
  const create = useCreateUser()
  const update = useUpdateUser()
  const roles = useRoleOptions()
  const departments = useDepartmentOptions()
  const form = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: emptyValues })
  const watchedName = useWatch({ control: form.control, name: "name" })
  const watchedUsername = useWatch({ control: form.control, name: "username" })
  const setSuggestedUsername = useCallback((value: string) => form.setValue("username", value), [form])
  const pinyin = useUsernamePinyin(watchedName, watchedUsername, setSuggestedUsername, !user)
  useEffect(() => {
    form.reset(
      user
        ? {
            name: user.name,
            username: user.username,
            email: user.email,
            phone: user.phone ?? "",
            avatar: user.avatar ?? "",
            nickname: user.nickname ?? "",
            gender: user.gender ?? "",
            status: user.status,
            roles: user.roles,
            isAdmin: user.isAdmin,
            departmentId: user.departmentId ?? "",
            remark: user.remark ?? "",
          }
        : emptyValues,
    )
  }, [form, user, open])
  const pending = create.isPending || update.isPending
  const submit = form.handleSubmit(async (values) => {
    const data = {
      ...values,
      phone: values.phone || null,
      avatar: values.avatar || null,
      nickname: values.nickname || null,
      gender: values.gender || null,
      departmentId: values.departmentId || null,
      remark: values.remark || null,
    }
    if (user) await update.mutateAsync({ userId: user.id, data })
    else await create.mutateAsync(data)
    toast.success(user ? "用户更新成功" : "用户创建成功")
    onSuccess()
    onOpenChange(false)
  })
  const departmentItems = departments.data ? flattenDepartments(departments.data) : []
  return (
    <CrudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={user ? "编辑用户" : "新增用户"}
      description="维护用户的账户、角色与组织信息"
      submitting={pending}
      onSubmit={() => void submit()}
    >
      <form onSubmit={submit}>
        <FieldGroup>
          <FormField label="姓名" htmlFor="user-name" required error={form.formState.errors.name?.message}>
            <Input id="user-name" {...form.register("name")} />
          </FormField>
          <FormField
            label="用户名"
            htmlFor="user-username"
            required
            description={pinyin.checking ? "正在校验姓名拼音…" : undefined}
            error={form.formState.errors.username?.message}
          >
            <Input id="user-username" {...form.register("username", { onChange: pinyin.markEdited })} />
          </FormField>
          <FormField label="邮箱" htmlFor="user-email" required error={form.formState.errors.email?.message}>
            <Input id="user-email" type="email" {...form.register("email")} />
          </FormField>
          <FormField label="手机" htmlFor="user-phone">
            <Input id="user-phone" {...form.register("phone")} />
          </FormField>
          <FormField label="昵称" htmlFor="user-nickname">
            <Input id="user-nickname" {...form.register("nickname")} />
          </FormField>
          <FormField label="头像地址" htmlFor="user-avatar">
            <Input id="user-avatar" {...form.register("avatar")} />
          </FormField>
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormField label="性别">
                <Select
                  items={genderItems}
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                >
                  <SelectTrigger aria-label="性别">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {genderItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormField label="状态">
                <Select items={statusItems} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {statusItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <FormField label="部门" error={departments.isError ? "部门加载失败" : undefined}>
                <Select
                  items={[
                    { value: "none", label: "未分配" },
                    ...departmentItems.map((item) => ({ value: item.id, label: item.label })),
                  ]}
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                  disabled={departments.isError}
                >
                  <SelectTrigger aria-label="部门">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">未分配</SelectItem>
                      {departmentItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="roles"
            render={({ field }) => (
              <FormField label="角色" error={roles.isError ? "角色加载失败" : undefined}>
                <div className="grid gap-2 rounded-lg border p-3">
                  {roles.data?.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(role.code)}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked ? [...field.value, role.code] : field.value.filter((code) => code !== role.code),
                          )
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </FormField>
            )}
          />
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={form.control}
              name="isAdmin"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              )}
            />
            管理员
          </label>
          <FormField label="备注" htmlFor="user-remark">
            <Textarea id="user-remark" {...form.register("remark")} />
          </FormField>
        </FieldGroup>
      </form>
    </CrudDrawer>
  )
}

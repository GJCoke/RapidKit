import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { rsaEncrypt } from "@rapidkit/utils"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@rapidkit/ui"
import { fetchPublicKey } from "@/services/api/auth"
import { useChangeUserPassword } from "@/services/hooks/use-user-mutations"
import { FormField } from "@/shared/crud"

type Values = { oldPassword: string; newPassword: string; confirmPassword: string }
export function ChangePasswordDialog({
  open,
  onOpenChange,
  userId,
  isSelf,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  isSelf: boolean
}) {
  const form = useForm<Values>({ defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" } })
  const mutation = useChangeUserPassword()
  useEffect(() => {
    if (open) form.reset()
  }, [form, open])
  const submit = form.handleSubmit(async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      form.setError("confirmPassword", { message: "两次密码不一致" })
      return
    }
    const key = await fetchPublicKey()
    if (key.error || !key.data) return
    const data = {
      newPassword: await rsaEncrypt(key.data, values.newPassword),
      ...(isSelf ? { oldPassword: await rsaEncrypt(key.data, values.oldPassword) } : {}),
    }
    await mutation.mutateAsync({ userId, data })
    toast.success("密码修改成功")
    onOpenChange(false)
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>密码将在浏览器中加密后提交</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          {isSelf && (
            <FormField label="旧密码" required>
              <Input type="password" {...form.register("oldPassword", { required: true })} />
            </FormField>
          )}
          <FormField label="新密码" required>
            <Input type="password" {...form.register("newPassword", { required: true })} />
          </FormField>
          <FormField label="确认密码" required error={form.formState.errors.confirmPassword?.message}>
            <Input type="password" {...form.register("confirmPassword", { required: true })} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={mutation.isPending} onClick={() => void submit()}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

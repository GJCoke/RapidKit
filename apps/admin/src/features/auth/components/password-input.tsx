import { useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff } from "lucide-react"
import { Button, Input } from "@rapidkit/ui"

export function PasswordInput({ label, ...props }: Omit<ComponentProps<typeof Input>, "type"> & { label: string }) {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation()
  const Icon = visible ? EyeOff : Eye
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-10" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-1 top-1/2 -translate-y-1/2"
        disabled={props.disabled}
        aria-label={t(visible ? "account.hidePassword" : "account.showPassword", { field: label })}
        onClick={() => setVisible((value) => !value)}
      >
        <Icon className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

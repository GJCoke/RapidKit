import type { ReactNode } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rapidkit/ui/components/select"
import { Switch } from "@rapidkit/ui/components/switch"
import { getThemeWorkbenchControl, hasThemeCapability, type ThemeWorkbenchField } from "../theme-capabilities"

const interactiveControlSelector = [
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  '[role="switch"]',
  '[role="radio"]',
  '[role="combobox"]',
].join(", ")

export function findUnwrappedThemeWorkbenchControls(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(interactiveControlSelector)).filter(
    (control) => !control.closest("[data-theme-workbench-field]"),
  )
}

export function ThemeSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function ThemeWorkbenchControl({
  field,
  className,
  children,
}: {
  field: ThemeWorkbenchField
  className?: string
  children: ReactNode
}) {
  const control = getThemeWorkbenchControl(field)
  if (control.kind === "runtime" && !hasThemeCapability(field)) return null
  return (
    <div data-theme-workbench-field={field} data-theme-workbench-kind={control.kind} className={className}>
      {children}
    </div>
  )
}

export function ThemeRow({
  field,
  label,
  hint,
  children,
}: {
  field: ThemeWorkbenchField
  label: string
  hint?: string
  children: ReactNode
}) {
  const control = getThemeWorkbenchControl(field)
  if (control.kind === "runtime" && !hasThemeCapability(field)) return null
  return (
    <div
      data-theme-workbench-field={field}
      data-theme-workbench-kind={control.kind}
      className="flex min-h-9 items-center justify-between gap-3"
    >
      <div>
        <div>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

export function ThemeSwitch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
}

export function ThemeSelect({
  value,
  onChange,
  options,
  disabled,
  label,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly (string | { value: string; label: string })[]
  disabled?: boolean
  label: string
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  )

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onChange(nextValue)
      }}
    >
      <SelectTrigger aria-label={label} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

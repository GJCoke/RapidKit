import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@rapidkit/ui"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@rapidkit/ui/components/command"

export interface ChoiceOption {
  value: string
  label: string
  group?: string
  disabled?: boolean
}
export function SearchableChoice({
  label,
  value,
  options,
  onChange,
  onSearch,
  disabled = false,
  loading = false,
  placeholder,
  clearable = true,
}: {
  label: string
  value: string | null
  options: ChoiceOption[]
  onChange: (value: string | null) => void
  onSearch?: (value: string) => void
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  clearable?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("")
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  const groups = new Map<string, ChoiceOption[]>()
  for (const option of options) groups.set(option.group ?? "", [...(groups.get(option.group ?? "") ?? []), option])
  const select = (next: string | null) => {
    if (disabled) return
    onChange(next)
    setOpen(false)
  }
  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next && !disabled)
        if (next) {
          setSearch("")
          onSearch?.("")
        }
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="outline" className="w-full min-w-0 justify-between" />}
        role="combobox"
        aria-label={label}
        aria-expanded={open && !disabled}
        disabled={disabled}
      >
        <span className="truncate">
          {options.find((option) => option.value === value)?.label || value || placeholder || t("common.search")}
        </span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </PopoverTrigger>
      <PopoverContent aria-label={label} align="start" className="w-(--anchor-width) max-w-[calc(100vw-24px)] p-1">
        <Command shouldFilter={!onSearch}>
          <CommandInput
            autoFocus
            aria-label={label}
            placeholder={placeholder || t("common.search")}
            value={search}
            onValueChange={(next) => {
              setSearch(next)
              onSearch?.(next)
            }}
          />
          <CommandList aria-busy={loading}>
            {loading && (
              <p role="status" className="p-3 text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            )}
            <CommandEmpty>{t("datatable.empty")}</CommandEmpty>
            {[...groups].map(([group, items]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {items.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    disabled={option.disabled}
                    data-checked={value === option.value}
                    onSelect={() => select(option.value)}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {clearable && value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => select(null)}>
            {t("common.reset")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

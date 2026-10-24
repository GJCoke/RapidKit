import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@rapidkit/ui/components/collapsible"
import { Button, Input, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@rapidkit/ui"

export interface UserFilters {
  keyword?: string
  status?: "1" | "2" | "3"
}
interface Props {
  value: UserFilters
  onChange: (value: UserFilters) => void
  onSearch: () => void
  onReset: () => void
}
export function UserSearch({ value, onChange, onSearch, onReset }: Props) {
  const { t } = useTranslation()
  const statuses = [
    { value: "all", label: t("users.search.allStatuses") },
    ...(["1", "2", "3"] as const).map((status) => ({ value: status, label: t(`users.status.${status}`) })),
  ]
  return (
    <Collapsible defaultOpen className="rounded-xl border bg-card p-3">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="mb-2 w-full justify-between"
            aria-label={t("users.search.toggle")}
          />
        }
      >
        {t("common.search")}
        <ChevronDown className="size-4" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch()
          }}
        >
          <Input
            aria-label={t("users.search.keyword")}
            placeholder={t("users.search.placeholder")}
            className="w-full sm:w-60"
            value={value.keyword ?? ""}
            onChange={(event) => onChange({ ...value, keyword: event.target.value || undefined })}
          />
          <Select
            items={statuses}
            value={value.status ?? "all"}
            onValueChange={(status) =>
              onChange({ ...value, status: status === "1" || status === "2" || status === "3" ? status : undefined })
            }
          >
            <SelectTrigger aria-label={t("users.search.status")} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statuses.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button type="submit">{t("users.search.submit")}</Button>
          <Button type="button" variant="outline" onClick={onReset}>
            {t("common.reset")}
          </Button>
        </form>
      </CollapsibleContent>
    </Collapsible>
  )
}

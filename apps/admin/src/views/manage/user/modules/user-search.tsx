import { useState } from "react"
import {Button, Input, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "@rapidkit/ui"

export interface UserFilters {
  keyword?: string
  status?: "1" | "2" | "3"
}
const statusItems = [
  { value: "all", label: "全部状态" },
  { value: "1", label: "正常" },
  { value: "2", label: "禁用" },
  { value: "3", label: "待激活" },
]

export function UserSearch({ value, onChange }: { value: UserFilters; onChange: (value: UserFilters) => void }) {
  const [draft, setDraft] = useState(value)
  const reset = () => {
    setDraft({})
    onChange({})
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onChange(draft)
      }}
    >
      <Input
        aria-label="关键词"
        className="w-60"
        placeholder="用户名、姓名或邮箱"
        value={draft.keyword ?? ""}
        onChange={(event) => setDraft({ ...draft, keyword: event.target.value || undefined })}
      />
      <Select
        items={statusItems}
        value={draft.status ?? "all"}
        onValueChange={(status) =>
          setDraft({ ...draft, status: status === "all" ? undefined : (status as UserFilters["status"]) })
        }
      >
        <SelectTrigger aria-label="用户状态" className="w-36">
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
      <Button type="submit">查询</Button>
      <Button type="button" variant="outline" onClick={reset}>
        重置
      </Button>
    </form>
  )
}

import { useNavigate } from "react-router"
import { cn } from "@rapidkit/ui/lib/utils"
import { useTabStore } from "@/stores/tab"

export function TabBar() {
  const { tabs, activeKey, setActiveKey, removeTab } = useTabStore()
  const navigate = useNavigate()

  const handleClick = (tab: { key: string; path: string }) => {
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const handleClose = (e: React.MouseEvent, key: string) => {
    e.stopPropagation()
    removeTab(key)
  }

  return (
    <div className="flex h-11 items-center gap-1 border-b border-border bg-background px-2">
      {tabs.map((tab) => (
        <div
          key={tab.key}
          className={cn(
            "group flex h-7 cursor-pointer items-center gap-1 rounded-md px-3 text-xs transition-colors",
            activeKey === tab.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onClick={() => handleClick(tab)}
        >
          <span>{tab.label}</span>
          {tab.closable !== false && (
            <button
              type="button"
              className="ml-1 hidden h-4 w-4 items-center justify-center rounded-sm hover:bg-primary-foreground/20 group-hover:inline-flex"
              onClick={(e) => handleClose(e, tab.key)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

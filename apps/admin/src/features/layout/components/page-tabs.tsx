import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"
import { X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { cn } from "@rapidkit/ui/lib/utils"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"

interface ClosableTab {
  key: string
  closable?: boolean
}

export function getClosableTabKeys(tabs: ClosableTab[], exceptKey?: string): string[] {
  return tabs.filter((tab) => tab.closable !== false && tab.key !== exceptKey).map((tab) => tab.key)
}

export function PageTabs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const currentRoute = useRouteStore((state) => state.flat[pathname])
  const { tabs, activeKey, addTab, setActiveKey, removeTab } = useTabStore()
  const [contextTabKey, setContextTabKey] = useState<string | null>(null)

  useEffect(() => {
    if (!currentRoute || currentRoute.children?.length) return
    addTab({ key: currentRoute.key, label: currentRoute.title, path: currentRoute.path })
  }, [addTab, currentRoute])

  const activateTab = (tab: { key: string; path: string }) => {
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const closeKeys = (keys: string[]) => {
    if (!keys.length) return
    const closesActiveTab = keys.includes(activeKey)
    keys.forEach((key) => removeTab(key))

    if (closesActiveTab) {
      const state = useTabStore.getState()
      const nextTab = state.tabs.find((tab) => tab.key === state.activeKey)
      if (nextTab) navigate(nextTab.path)
    }
  }

  const closeOthers = (tab: { key: string; path: string }) => {
    closeKeys(getClosableTabKeys(tabs, tab.key))
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  return (
    <div
      className="flex h-tab shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 pt-2"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key
        const closable = tab.closable !== false

        return (
          <DropdownMenu
            key={tab.key}
            open={contextTabKey === tab.key}
            onOpenChange={(open) => {
              if (!open) setContextTabKey(null)
            }}
          >
            <DropdownMenuTrigger asChild>
              <div
                className={cn(
                  "group flex h-9 shrink-0 items-center rounded-t-md border border-b-0 px-1 transition-colors",
                  active
                    ? "border-border bg-card text-card-foreground shadow-tab"
                    : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                onAuxClick={(event) => {
                  if (event.button === 1 && closable) {
                    event.preventDefault()
                    closeKeys([tab.key])
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextTabKey(tab.key)
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className="h-full max-w-40 truncate px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={() => activateTab(tab)}
                >
                  {tab.label}
                </button>
                {closable && (
                  <button
                    type="button"
                    aria-label={t("tabs.close")}
                    className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-60 transition-colors hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeKeys([tab.key])
                    }}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem disabled={!closable} onSelect={() => closeKeys([tab.key])}>
                {t("tabs.close")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => closeOthers(tab)}>{t("tabs.closeOthers")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => closeKeys(getClosableTabKeys(tabs))}>
                {t("tabs.closeAll")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </div>
  )
}

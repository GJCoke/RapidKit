import { useEffect, useRef, useState, type KeyboardEvent } from "react"
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

export function getTabKeyForNavigation(tabs: ClosableTab[], currentKey: string, key: string): string | null {
  if (!tabs.length) return null

  if (key === "Home") return tabs[0].key
  if (key === "End") return tabs[tabs.length - 1].key
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null

  const currentIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === currentKey),
  )
  const offset = key === "ArrowRight" ? 1 : -1
  return tabs[(currentIndex + offset + tabs.length) % tabs.length].key
}

export function getFocusKeyAfterClose(tabs: ClosableTab[], closingKeys: string[], originKey: string): string | null {
  const closing = new Set(closingKeys)
  const remainingTabs = tabs.filter((tab) => !closing.has(tab.key))
  if (!remainingTabs.length) return null
  if (!closing.has(originKey) && remainingTabs.some((tab) => tab.key === originKey)) return originKey

  const originIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === originKey),
  )
  return remainingTabs[Math.min(originIndex, remainingTabs.length - 1)].key
}

export type TabKeyboardAction = { type: "focus"; key: string } | { type: "activate" } | { type: "context" }

export function getTabKeyboardAction(
  tabs: ClosableTab[],
  currentKey: string,
  key: string,
  shiftKey = false,
): TabKeyboardAction | null {
  const focusKey = getTabKeyForNavigation(tabs, currentKey, key)
  if (focusKey) return { type: "focus", key: focusKey }
  if (key === "Enter" || key === " ") return { type: "activate" }
  if (key === "ContextMenu" || (key === "F10" && shiftKey)) return { type: "context" }
  return null
}

export function PageTabs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const currentRoute = useRouteStore((state) => state.flat[pathname])
  const { tabs, activeKey, addTab, setActiveKey, removeTab } = useTabStore()
  const [contextTabKey, setContextTabKey] = useState<string | null>(null)
  const [focusedTabKey, setFocusedTabKey] = useState(activeKey)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusKey = useRef<string | null>(null)

  useEffect(() => {
    if (!currentRoute || currentRoute.children?.length) return
    addTab({ key: currentRoute.key, label: currentRoute.title, path: currentRoute.path })
  }, [addTab, currentRoute])

  useEffect(() => {
    setFocusedTabKey(activeKey)
  }, [activeKey])

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === focusedTabKey)) setFocusedTabKey(activeKey)
  }, [activeKey, focusedTabKey, tabs])

  const focusTab = (key: string, defer = false) => {
    setFocusedTabKey(key)
    const focus = () => {
      tabRefs.current.get(key)?.focus()
      if (pendingFocusKey.current === key) pendingFocusKey.current = null
    }

    if (defer) requestAnimationFrame(focus)
    else focus()
  }

  const activateTab = (tab: { key: string; path: string }) => {
    setFocusedTabKey(tab.key)
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const closeKeys = (keys: string[], focusOriginKey: string) => {
    const closableKeys = keys.filter((key) => tabs.some((tab) => tab.key === key && tab.closable !== false))
    if (!closableKeys.length) return

    const closesActiveTab = closableKeys.includes(activeKey)
    const nextFocusKey = getFocusKeyAfterClose(tabs, closableKeys, focusOriginKey)
    pendingFocusKey.current = nextFocusKey
    closableKeys.forEach((key) => removeTab(key))

    if (closesActiveTab) {
      const state = useTabStore.getState()
      const nextTab = state.tabs.find((tab) => tab.key === state.activeKey)
      if (nextTab) navigate(nextTab.path)
    }

    if (nextFocusKey) focusTab(nextFocusKey, true)
  }

  const closeOthers = (tab: { key: string; path: string }) => {
    closeKeys(getClosableTabKeys(tabs, tab.key), tab.key)
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const openContextMenu = (tabKey: string) => {
    pendingFocusKey.current = tabKey
    focusTab(tabKey)
    setContextTabKey(tabKey)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: { key: string; path: string }) => {
    const action = getTabKeyboardAction(tabs, tab.key, event.key, event.shiftKey)
    if (!action) return

    event.preventDefault()
    if (action.type === "focus") focusTab(action.key)
    else if (action.type === "activate") activateTab(tab)
    else openContextMenu(tab.key)
  }

  return (
    <div
      className="flex h-tab shrink-0 items-end gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 pt-2"
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key
        const closable = tab.closable !== false

        return (
          <DropdownMenu
            key={tab.key}
            open={contextTabKey === tab.key}
            onOpenChange={(open) => {
              setContextTabKey((currentKey) => (open ? tab.key : currentKey === tab.key ? null : currentKey))
            }}
          >
            <div
              role="presentation"
              className={cn(
                "group flex h-9 shrink-0 items-center rounded-t-md border border-b-0 px-1 transition-colors",
                active
                  ? "border-border bg-card text-card-foreground shadow-tab"
                  : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
              onAuxClick={(event) => {
                if (event.button === 1 && closable) {
                  event.preventDefault()
                  closeKeys([tab.key], tab.key)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                openContextMenu(tab.key)
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  ref={(node) => {
                    if (node) tabRefs.current.set(tab.key, node)
                    else tabRefs.current.delete(tab.key)
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  tabIndex={focusedTabKey === tab.key ? 0 : -1}
                  className="h-full max-w-40 truncate px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onPointerDown={(event) => {
                    if (event.button === 0 && !event.ctrlKey) {
                      event.preventDefault()
                      event.currentTarget.focus()
                    }
                  }}
                  onFocus={() => setFocusedTabKey(tab.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab)}
                  onClick={() => activateTab(tab)}
                >
                  {tab.label}
                </button>
              </DropdownMenuTrigger>
              {closable && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t("tabs.close")}
                  className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-60 transition-colors hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  onClick={() => closeKeys([tab.key], tab.key)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
            <DropdownMenuContent
              align="start"
              className="w-40"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                const returnFocusKey = pendingFocusKey.current ?? tab.key
                if (tabs.some((item) => item.key === returnFocusKey)) focusTab(returnFocusKey, true)
              }}
            >
              <DropdownMenuItem disabled={!closable} onSelect={() => closeKeys([tab.key], tab.key)}>
                {t("tabs.close")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => closeOthers(tab)}>{t("tabs.closeOthers")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => closeKeys(getClosableTabKeys(tabs), tab.key)}>
                {t("tabs.closeAll")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </div>
  )
}

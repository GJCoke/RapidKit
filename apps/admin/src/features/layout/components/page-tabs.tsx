import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"
import { Maximize, Minimize, RefreshCw } from "lucide-react"

import { Button } from "@rapidkit/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@rapidkit/ui/components/tooltip"
import { cn } from "@rapidkit/ui/lib/utils"
import { useEffectiveThemeConfig } from "@/features/theme"
import { getRouteInstanceKey } from "@/features/router/route-instance-key"
import { useRouteStore } from "@/stores/route"
import { isTabRemovable, useTabStore } from "@/stores/tab"
import { useAppStore } from "@/stores/app"
import { useRouteCacheStore } from "@/features/router/route-cache-store"
import { findRouteForPath } from "@/features/router/route-model"

import { ChromePageTab } from "./chrome-page-tab"
import { resolveMenuIcon } from "./sidebar/sidebar-icon"
import { PageTabContextMenu } from "./page-tab-context-menu"

interface ClosableTab {
  key: string
  closable?: boolean
  fixedIndex?: number
  pinned?: boolean
}

export function getClosableTabKeys(tabs: ClosableTab[], exceptKey?: string): string[] {
  return tabs.filter((tab) => isTabRemovable(tab) && tab.key !== exceptKey).map((tab) => tab.key)
}

export function PageTabs() {
  const { t } = useTranslation()
  const theme = useEffectiveThemeConfig()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const snapshot = useRouteStore((state) => state.snapshot)
  const currentRoute = findRouteForPath(snapshot, pathname)
  const { tabs, activeKey, addLocation, setActiveKey, removeTabs, closeLeftOf, closeRightOf, pinTab, unpinTab } =
    useTabStore()
  const fullContent = useAppStore((state) => state.fullContent)
  const toggleFullContent = useAppStore((state) => state.toggleFullContent)
  const pendingRefreshKey = useRouteCacheStore((state) => state.pendingRefreshKey)
  const refreshing = pendingRefreshKey !== null
  const tabRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!currentRoute || currentRoute.children?.length) return
    if (currentRoute.kind === "external" || currentRoute.kind === "layout") return
    addLocation(currentRoute, `${pathname}${search}`, (key) => t(key))
  }, [addLocation, currentRoute, pathname, search, t])

  useEffect(() => {
    tabRefs.current.get(activeKey)?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [activeKey])

  const activateTab = (tab: { key: string; path: string }) => {
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const applyRemoval = (remove: () => string[]) => {
    const closesActiveTab = activeKey
    const removedKeys = remove()
    if (!removedKeys.length) return []
    useRouteCacheStore.getState().evict(removedKeys)

    if (removedKeys.includes(closesActiveTab)) {
      const state = useTabStore.getState()
      const nextTab = state.tabs.find((tab) => tab.key === state.activeKey)
      if (nextTab) navigate(nextTab.path)
    }
    return removedKeys
  }

  const closeTabs = (remove: () => string[]) => {
    applyRemoval(remove)
  }

  const closeKeys = (keys: string[]) => closeTabs(() => removeTabs(keys))

  const closeOthers = (tab: { key: string; path: string }) => {
    closeKeys(getClosableTabKeys(tabs, tab.key))
    setActiveKey(tab.key)
    navigate(tab.path)
  }

  const refreshCurrentPage = () => {
    if (refreshing || !currentRoute) return
    useRouteCacheStore.getState().requestRefresh(getRouteInstanceKey(currentRoute, `${pathname}${search}`))
  }

  const fullscreenLabel = t(fullContent ? "tabs.exitFullscreen" : "tabs.fullscreen")

  return (
    <div className="flex h-tab shrink-0 items-center bg-background px-4 shadow-tab">
      <div
        data-testid="page-tabs-scroller"
        className="h-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex h-full w-max items-end pr-[18px]">
          {tabs.map((tab) => {
            const active = activeKey === tab.key
            const closable = isTabRemovable(tab)
            const tabIndex = tabs.findIndex((item) => item.key === tab.key)
            const canCloseLeft = tabs.slice(0, tabIndex).some(isTabRemovable)
            const canCloseRight = tabs.slice(tabIndex + 1).some(isTabRemovable)
            const TabIcon = resolveMenuIcon({ icon: tab.icon, localIcon: tab.localIcon })

            return (
              <PageTabContextMenu
                key={tab.key}
                closable={closable}
                closeAllLabel={t("tabs.closeAll")}
                closeLabel={t("tabs.close")}
                closeLeftLabel={t("tabs.closeLeft")}
                closeOthersLabel={t("tabs.closeOthers")}
                closeRightLabel={t("tabs.closeRight")}
                pinLabel={t("tabs.pin")}
                unpinLabel={t("tabs.unpin")}
                canCloseAll={getClosableTabKeys(tabs).length > 0}
                canCloseLeft={canCloseLeft}
                canCloseOthers={getClosableTabKeys(tabs, tab.key).length > 0}
                canCloseRight={canCloseRight}
                onClose={() => closeKeys([tab.key])}
                onCloseAll={() => closeKeys(getClosableTabKeys(tabs))}
                onCloseLeft={() => closeTabs(() => closeLeftOf(tab.key))}
                onCloseOthers={() => closeOthers(tab)}
                onCloseRight={() => closeTabs(() => closeRightOf(tab.key))}
                onPin={() => pinTab(tab.key)}
                onUnpin={() => unpinTab(tab.key)}
                pinned={tab.pinned === true}
                systemFixed={tab.fixedIndex !== undefined}
              >
                <ChromePageTab
                  ref={(node) => {
                    if (node) tabRefs.current.set(tab.key, node)
                    else tabRefs.current.delete(tab.key)
                  }}
                  active={active}
                  closable={closable}
                  closeLabel={t("tabs.close")}
                  icon={TabIcon}
                  label={tab.label}
                  onActivate={() => activateTab(tab)}
                  onClose={() => closeKeys([tab.key])}
                  onMiddleClick={() => {
                    if (theme.experience.middleClickCloseTab) closeKeys([tab.key])
                  }}
                />
              </PageTabContextMenu>
            )
          })}
        </div>
      </div>
      <div data-testid="page-tabs-tools" className="ml-2 flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("tabs.reload")}
                disabled={refreshing}
                onClick={refreshCurrentPage}
              >
                <RefreshCw className={cn("size-[18px]", refreshing && "animate-spin")} />
              </Button>
            }
          />
          <TooltipContent>{t("tabs.reload")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={fullscreenLabel}
                onClick={toggleFullContent}
              >
                {fullContent ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
              </Button>
            }
          />
          <TooltipContent>{fullscreenLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

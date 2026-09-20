import { useEffect, type ReactNode } from "react"
import { RouteEffects } from "@/features/router/route-effects"
import { useAppStore } from "@/stores/app"
import { useRouteStore } from "@/stores/route"
import { useTabStore } from "@/stores/tab"
import { Header } from "./header"
import { Sidebar } from "./sidebar"
import { PageTabs } from "./page-tabs"
import { PageContainer } from "./page-container"
import { RouteTransition } from "./route-transition"
import { useMobileWatch } from "./use-mobile-watch"
import { useEffectiveThemeConfig } from "@/features/theme"
import { LayoutShell } from "./layout-shell"
import { MenuProvider, useLayoutMenu } from "./menu/menu-context"
import { resolveLayoutRegions } from "./menu/menu-mode-renderer"
import { HorizontalMenu } from "./menu/horizontal-menu"
import { MixedSidebar } from "./menu/mixed-sidebar"

function AdminLayoutContent() {
  const { siderCollapse, isMobile, mixSiderFixed, fullContent, setSiderCollapse } = useAppStore()
  const menus = useRouteStore((state) => state.menus)
  const setTabPersistenceEnabled = useTabStore((state) => state.setPersistenceEnabled)
  const theme = useEffectiveThemeConfig()
  const menu = useLayoutMenu()
  const activeFirstHasChildren = menu.secondLevelMenus.length > 0
  const mixedChildMenus =
    theme.layout.mode === "vertical-hybrid-header-first" ? menu.childLevelMenus : menu.secondLevelMenus
  const regions = resolveLayoutRegions({
    mode: theme.layout.mode,
    collapsed: siderCollapse,
    activeFirstHasChildren,
    hasMixedChildMenus: mixedChildMenus.length > 0,
    mixSiderFixed,
    sidebar: theme.sidebar,
  })

  useEffect(() => {
    if (!isMobile) setSiderCollapse(theme.layout.defaultSidebarCollapsed, "theme")
  }, [isMobile, setSiderCollapse, theme.layout.defaultSidebarCollapsed])

  useEffect(() => {
    setTabPersistenceEnabled(theme.experience.restoreTabs)
  }, [setTabPersistenceEnabled, theme.experience.restoreTabs])

  const headerMenus =
    regions.headerMenu === "all"
      ? menus
      : regions.headerMenu === "first-level"
        ? menu.firstLevelMenus
        : regions.headerMenu === "active-children"
          ? menu.secondLevelMenus
          : []
  const headerMenu = headerMenus.length ? (
    <HorizontalMenu
      menus={headerMenus}
      selectedPath={menu.selectedPath}
      onSelectBranch={
        regions.headerMenu === "active-children"
          ? menu.selectSecondLevel
          : regions.headerMenu === "all" || regions.headerMenu === "first-level"
            ? menu.selectFirstLevel
            : undefined
      }
      branchBehavior={regions.headerMenu === "first-level" ? "select" : "dropdown"}
    />
  ) : undefined

  let sidebar: ReactNode
  if (!isMobile && regions.sidebarVisible) {
    if (regions.sidebarKind === "standard") {
      const sidebarMenus = regions.sidebarMenu === "active-children" ? menu.secondLevelMenus : menus
      sidebar = (
        <Sidebar
          menus={sidebarMenus}
          width={regions.sidebarWidth}
          showBrand={regions.orientation === "vertical"}
          fixed={regions.orientation === "vertical"}
        />
      )
    } else {
      const secondLevel = regions.sidebarKind === "mixed-second"
      const railMenus = secondLevel ? menu.secondLevelMenus : menu.firstLevelMenus
      sidebar = (
        <MixedSidebar
          railMenus={railMenus}
          childMenus={regions.orientation === "vertical" ? mixedChildMenus : []}
          activeKey={secondLevel ? menu.activeSecondLevelKey : menu.activeFirstLevelKey}
          onSelect={secondLevel ? menu.selectSecondLevel : menu.selectFirstLevel}
          railWidth={siderCollapse ? theme.sidebar.mixCollapsedWidth : theme.sidebar.mixWidth}
          childWidth={theme.sidebar.mixChildMenuWidth}
          childPanelOpen={menu.childPanelOpen}
          fixedPosition={regions.orientation === "vertical"}
          showBrand={regions.orientation === "vertical"}
          collapsed={siderCollapse}
          onMouseLeave={menu.resetTransientSelection}
        />
      )
    }
  }

  return (
    <LayoutShell
      orientation={regions.orientation}
      fullContent={fullContent}
      sidebar={sidebar}
      sidebarWidth={isMobile ? 0 : regions.sidebarWidth}
      scrollMode={theme.layout.scrollMode}
      fixedHeaderTabs={theme.layout.fixedHeaderTabs}
      header={
        <Header
          showLogo={regions.showLogo}
          showSidebarToggle={regions.showSidebarToggle}
          menu={headerMenu}
          showBreadcrumb={!headerMenu}
        />
      }
      tabs={theme.layout.showTabs ? <PageTabs /> : undefined}
    >
      <PageContainer>
        <RouteTransition />
      </PageContainer>
    </LayoutShell>
  )
}

export function AdminLayout() {
  useMobileWatch()
  const theme = useEffectiveThemeConfig()

  return (
    <MenuProvider layoutMode={theme.layout.mode}>
      <RouteEffects />
      <AdminLayoutContent />
    </MenuProvider>
  )
}

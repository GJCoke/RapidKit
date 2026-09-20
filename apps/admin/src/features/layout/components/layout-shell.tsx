import type { ReactNode } from "react"
import { ScrollArea } from "@rapidkit/ui/components/scroll-area"
import { cn } from "@rapidkit/ui/lib/utils"
import type { LayoutScrollMode } from "@/features/theme/theme-config"

export function LayoutShell({
  header,
  sidebar,
  tabs,
  sidebarWidth,
  scrollMode,
  orientation,
  fixedHeaderTabs,
  fullContent = false,
  children,
}: {
  header: ReactNode
  sidebar?: ReactNode
  tabs?: ReactNode
  sidebarWidth: number | string
  scrollMode: LayoutScrollMode
  orientation: "vertical" | "horizontal"
  fixedHeaderTabs: boolean
  fullContent?: boolean
  children: ReactNode
}) {
  const content = (
    <main data-layout-scroll={scrollMode} className={fixedHeaderTabs ? "h-full" : "min-h-full"}>
      {children}
    </main>
  )

  const scrollRegion = (owner: "content" | "page", scrollChildren: ReactNode) =>
    scrollMode === "content" ? (
      <ScrollArea
        data-testid="layout-scroll-owner"
        data-layout-scroll-owner={owner}
        data-layout-scroll-mode={scrollMode}
        className="min-h-0 flex-1"
      >
        {scrollChildren}
      </ScrollArea>
    ) : (
      <div
        data-testid="layout-scroll-owner"
        data-layout-scroll-owner={owner}
        data-layout-scroll-mode={scrollMode}
        className="min-h-0 flex-1 overflow-auto"
      >
        {scrollChildren}
      </div>
    )

  const tabsRegion = <div data-testid="layout-tabs-region">{tabs}</div>
  const fixedChrome = (fixedChildren: ReactNode) => (
    <div
      data-testid="layout-fixed-chrome"
      data-layout-chrome="fixed"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {fixedChildren}
    </div>
  )

  const flowingChrome = (flowingChildren: ReactNode) => (
    <div data-layout-chrome="flowing" className="flex min-h-full flex-col">
      {flowingChildren}
    </div>
  )

  const headerRegion = (
    <div
      data-testid="layout-header-region"
      aria-hidden={fullContent}
      inert={fullContent}
      className={cn(
        "grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        fullContent ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden">{header}</div>
    </div>
  )

  const sidebarRegion = (
    <div
      data-testid="layout-sidebar-region"
      aria-hidden={fullContent}
      inert={fullContent}
      className={cn(
        "shrink-0 transition-[width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        orientation === "vertical" && "w-0 overflow-visible",
        fullContent &&
          "pointer-events-none opacity-0 [&>[data-sidebar-shell]]:-translate-x-full [&>[data-sidebar-shell]]:opacity-0",
      )}
      style={orientation === "horizontal" ? { width: fullContent ? 0 : sidebarWidth } : undefined}
    >
      {sidebar}
    </div>
  )

  if (orientation === "horizontal") {
    const horizontalBody = (
      <div className="flex min-h-0 flex-1">
        {sidebarRegion}
        <div data-layout-main data-testid="layout-main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {tabsRegion}
          {fixedHeaderTabs ? scrollRegion("content", content) : content}
        </div>
      </div>
    )

    return (
      <div
        data-layout-shell
        data-layout-orientation="horizontal"
        className="flex h-screen flex-col overflow-hidden bg-background"
      >
        {fixedHeaderTabs
          ? fixedChrome(
              <>
                {headerRegion}
                {horizontalBody}
              </>,
            )
          : scrollRegion(
              "page",
              flowingChrome(
                <>
                  {headerRegion}
                  {horizontalBody}
                </>,
              ),
            )}
      </div>
    )
  }

  const verticalMain = (
    <div
      data-layout-main
      data-testid="layout-main"
      className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300 ease-in-out motion-reduce:transition-none"
      style={{ marginLeft: fullContent ? 0 : sidebarWidth }}
    >
      {fixedHeaderTabs
        ? fixedChrome(
            <>
              {headerRegion}
              {tabsRegion}
              {scrollRegion("content", content)}
            </>,
          )
        : scrollRegion(
            "page",
            flowingChrome(
              <>
                {headerRegion}
                {tabsRegion}
                {content}
              </>,
            ),
          )}
    </div>
  )

  return (
    <div data-layout-shell data-layout-orientation="vertical" className="flex h-screen overflow-hidden bg-background">
      {sidebarRegion}
      {verticalMain}
    </div>
  )
}

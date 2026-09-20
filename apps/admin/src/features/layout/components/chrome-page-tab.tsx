import { forwardRef, type ComponentPropsWithoutRef } from "react"
import type { LucideIcon } from "lucide-react"
import { XIcon } from "lucide-react"

import { cn } from "@rapidkit/ui/lib/utils"

import { ChromeTabBackground } from "./chrome-tab-background"
import styles from "./chrome-page-tab.module.css"

interface ChromePageTabProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  active: boolean
  closable: boolean
  closeLabel: string
  icon: LucideIcon
  label: string
  onActivate: () => void
  onClose: () => void
  onMiddleClick: () => void
}

export function getTabChromeClasses(active: boolean): string {
  return cn(
    styles.chromeTab,
    "relative -mr-[18px] inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-4 whitespace-nowrap px-6 py-1.5 text-[14px] leading-[21px]",
    active ? styles.active : "text-foreground",
  )
}

export const ChromePageTab = forwardRef<HTMLDivElement, ChromePageTabProps>(function ChromePageTab(
  {
    active,
    closable,
    closeLabel,
    icon: TabIcon,
    label,
    onActivate,
    onClose,
    onMiddleClick,
    className,
    onAuxClick: onTriggerAuxClick,
    onPointerDown: onTriggerPointerDown,
    ...triggerProps
  },
  ref,
) {
  return (
    <div
      {...triggerProps}
      ref={ref}
      aria-current={active ? "page" : undefined}
      className={cn(getTabChromeClasses(active), className)}
      data-active={active || undefined}
      data-testid="chrome-page-tab"
      onAuxClick={(event) => {
        onTriggerAuxClick?.(event)
        if (event.defaultPrevented) return
        if (event.button !== 1 || !closable) return
        event.preventDefault()
        onMiddleClick()
      }}
      onPointerDown={(event) => {
        onTriggerPointerDown?.(event)
        if (event.defaultPrevented) return
        if (event.button !== 0 || event.ctrlKey) return
        event.preventDefault()
        onActivate()
      }}
    >
      <div
        className={cn(styles.background, "pointer-events-none absolute left-0 top-0 -z-[1] h-full w-full")}
        data-testid="chrome-tab-background-container"
      >
        <ChromeTabBackground />
      </div>
      <TabIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="max-w-60 truncate">{label}</span>
      {closable && (
        <button
          aria-label={closeLabel}
          className={cn(
            styles.closeButton,
            "relative inline-flex size-4 items-center justify-center rounded-full text-sm outline-none transition-all duration-300",
          )}
          tabIndex={-1}
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.button === 0) onClose()
          }}
        >
          <XIcon aria-hidden="true" />
        </button>
      )}
      <span
        aria-hidden="true"
        className={cn(styles.divider, "absolute right-[7px] h-4 w-px bg-[#1f2225] transition-opacity duration-300")}
        data-testid="chrome-tab-divider"
      />
    </div>
  )
})

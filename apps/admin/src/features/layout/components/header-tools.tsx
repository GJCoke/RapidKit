import { useRef, useState } from "react"
import { Ellipsis } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { LocaleSwitch } from "@/features/locale/locale-switch"
import { APP_LOCALES } from "@/features/locale/locale-model"
import { ThemeWorkbench, ThemeWorkbenchTrigger } from "@/features/theme/components/theme-workbench-trigger"
import { useLocaleStore } from "@/stores/locale"

import { BrowserFullscreen } from "./browser-fullscreen"
import { GlobalSearch } from "./global-search/global-search"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"

type HeaderTool = "search" | "browserFullscreen" | "locale" | "themeWorkbench" | "theme" | "user"

export function getHeaderToolsLayout(isMobile: boolean): { direct: HeaderTool[]; overflow: HeaderTool[] } {
  if (isMobile) {
    return {
      direct: ["search", "theme", "user"],
      overflow: ["browserFullscreen", "locale", "themeWorkbench"],
    }
  }

  return {
    direct: ["search", "browserFullscreen", "locale", "themeWorkbench", "theme", "user"],
    overflow: [],
  }
}

export function HeaderTools({ isMobile }: { isMobile: boolean }) {
  const { t } = useTranslation()
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const layout = getHeaderToolsLayout(isMobile)
  const localeLabel = t("layout.switchLanguage")
  const [workbenchOpen, setWorkbenchOpen] = useState(false)
  const overflowTriggerRef = useRef<HTMLButtonElement>(null)

  const handleWorkbenchOpenChange = (open: boolean) => {
    setWorkbenchOpen(open)
    if (!open) requestAnimationFrame(() => overflowTriggerRef.current?.focus())
  }

  const renderTool = (tool: HeaderTool) => {
    switch (tool) {
      case "search":
        return <GlobalSearch key={tool} />
      case "browserFullscreen":
        return (
          <BrowserFullscreen
            key={tool}
            enterLabel={t("layout.browserFullscreen.enter")}
            exitLabel={t("layout.browserFullscreen.exit")}
            errorMessage={t("layout.browserFullscreen.unavailable")}
          />
        )
      case "locale":
        return <LocaleSwitch key={tool} />
      case "themeWorkbench":
        return <ThemeWorkbenchTrigger key={tool} />
      case "theme":
        return <ThemeToggle key={tool} />
      case "user":
        return <UserMenu key={tool} />
    }
  }

  const renderOverflowTool = (tool: HeaderTool) => {
    switch (tool) {
      case "browserFullscreen":
        return (
          <BrowserFullscreen
            key={tool}
            menuItem
            enterLabel={t("layout.browserFullscreen.enter")}
            exitLabel={t("layout.browserFullscreen.exit")}
            errorMessage={t("layout.browserFullscreen.unavailable")}
          />
        )
      case "locale":
        return (
          <DropdownMenuSub key={tool}>
            <DropdownMenuSubTrigger>{localeLabel}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {APP_LOCALES.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.key}
                  checked={option.key === locale}
                  onClick={() => setLocale(option.key)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )
      case "themeWorkbench":
        return (
          <DropdownMenuItem key={tool} onClick={() => setWorkbenchOpen(true)}>
            {t("theme.workbench.trigger")}
          </DropdownMenuItem>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex items-center gap-1">
      {layout.direct.map(renderTool)}
      {layout.overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button ref={overflowTriggerRef} type="button" variant="ghost" size="icon" />}
            aria-label={t("layout.moreTools")}
          >
            <Ellipsis className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            {layout.overflow.map(renderOverflowTool)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isMobile && <ThemeWorkbench open={workbenchOpen} onOpenChange={handleWorkbenchOpenChange} />}
    </div>
  )
}

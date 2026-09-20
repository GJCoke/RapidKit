import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { cn } from "@rapidkit/ui/lib/utils"

export function SidebarBrand({ collapsed, className }: { collapsed: boolean; className?: string }) {
  const { t } = useTranslation()
  return (
    <Link to="/" className={cn("flex h-14 min-w-0 shrink-0 items-center justify-center overflow-hidden", className)}>
      <img src="/logo-loading.svg" alt="RapidKit" className="size-8 shrink-0" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap pl-2 text-base font-bold text-sidebar-primary transition-[max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
          collapsed ? "max-w-0 opacity-0" : "max-w-36 opacity-100",
        )}
      >
        {t("system.title")}
      </span>
    </Link>
  )
}

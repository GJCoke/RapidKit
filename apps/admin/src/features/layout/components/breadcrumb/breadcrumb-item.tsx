import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"
import { BreadcrumbPage } from "@rapidkit/ui/components/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"
import { getMenuLabel } from "../menu-label"
import { resolveMenuIcon } from "../sidebar/sidebar-icon"
import type { BreadcrumbNode, BreadcrumbOption } from "./breadcrumb-model"

function BreadcrumbContent({ item }: { item: BreadcrumbOption }) {
  const { t } = useTranslation()
  const Icon = item.icon || item.localIcon ? resolveMenuIcon(item) : null

  return (
    <span className="inline-flex min-w-0 items-center gap-1 align-middle">
      {Icon && <Icon data-breadcrumb-icon aria-hidden="true" className="size-[18px] shrink-0" />}
      <span className="truncate">{getMenuLabel(item, t)}</span>
    </span>
  )
}

function BreadcrumbOptionItem({
  option,
  activate,
}: {
  option: BreadcrumbOption
  activate: (item: BreadcrumbOption) => void
}) {
  if (option.options?.length) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <BreadcrumbContent item={option} />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {option.options.map((child) => (
            <BreadcrumbOptionItem key={child.key} option={child} activate={activate} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <DropdownMenuItem onClick={() => activate(option)}>
      <BreadcrumbContent item={option} />
    </DropdownMenuItem>
  )
}

export function BreadcrumbTrailItem({ item }: { item: BreadcrumbNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  if (item.current) {
    return (
      <BreadcrumbPage className="inline-flex min-w-0 max-w-48">
        <BreadcrumbContent item={item} />
      </BreadcrumbPage>
    )
  }

  if (!item.options.length) return <BreadcrumbContent item={item} />

  function activate(option: BreadcrumbOption) {
    if (!option.href && option.path === pathname) return
    if (option.href) window.open(option.href, "_blank", "noopener,noreferrer")
    else navigate(option.path)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={getMenuLabel(item, t)}
        className="inline-flex min-w-0 items-center gap-0.5 rounded-sm px-1 py-0.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BreadcrumbContent item={item} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        {item.options.map((option) => (
          <BreadcrumbOptionItem key={option.key} option={option} activate={activate} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

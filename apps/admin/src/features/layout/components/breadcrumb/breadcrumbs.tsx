import { Fragment, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator } from "@rapidkit/ui/components/breadcrumb"
import { useRouteStore } from "@/stores/route"
import { buildBreadcrumbs } from "./breadcrumb-model"
import { BreadcrumbTrailItem } from "./breadcrumb-item"

export function Breadcrumbs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const menus = useRouteStore((state) => state.menus)
  const flat = useRouteStore((state) => state.flat)
  const trail = useMemo(() => buildBreadcrumbs({ pathname, menus, flat }), [pathname, menus, flat])

  if (!trail.length) return null

  return (
    <Breadcrumb aria-label={t("layout.breadcrumbs")} className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {trail.map((item, index) => (
          <Fragment key={item.key}>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbTrailItem item={item} />
            </BreadcrumbItem>
            {index < trail.length - 1 && (
              <BreadcrumbSeparator className="shrink-0 text-muted-foreground/70">/</BreadcrumbSeparator>
            )}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

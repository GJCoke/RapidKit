import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@rapidkit/ui/components/breadcrumb"
import { useRouteStore, type MenuItem } from "@/stores/route"
import { getMenuLabel } from "./menu-label"

export function buildBreadcrumbTrail(pathname: string, flat: Record<string, MenuItem>): MenuItem[] {
  const segments = pathname.split("/").filter(Boolean)
  return segments
    .map((_, index) => `/${segments.slice(0, index + 1).join("/")}`)
    .map((path) => flat[path])
    .filter((item): item is MenuItem => Boolean(item))
}

export function Breadcrumbs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const flat = useRouteStore((state) => state.flat)
  const trail = buildBreadcrumbTrail(pathname, flat)

  if (!trail.length) return null

  return (
    <Breadcrumb aria-label={t("layout.breadcrumbs")}>
      <BreadcrumbList>
        {trail.map((item, index) => (
          <Fragment key={item.path}>
            <BreadcrumbItem>
              {index === trail.length - 1 ? (
                <BreadcrumbPage>{getMenuLabel(item, t)}</BreadcrumbPage>
              ) : (
                getMenuLabel(item, t)
              )}
            </BreadcrumbItem>
            {index < trail.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

import { useEffect, useId, useLayoutEffect } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate, useNavigation } from "react-router"
import type { MenuItem } from "@/stores/route"
import { useRouteStore } from "@/stores/route"
import { useEffectiveThemeConfig } from "@/features/theme"
import { navigationProgressController, type ProgressAdapter } from "./navigation-progress-controller"
import { reconcileRouteRuntime } from "./route-reconcile"
import { useTabStore } from "@/stores/tab"
import { useRouteCacheStore } from "./route-cache-store"
import { findRouteForPath } from "./route-model"

export function resolveDocumentTitle(
  route: Pick<MenuItem, "title" | "i18nKey"> | undefined,
  translate: (key: string) => string,
  appTitle: string,
) {
  if (!route) return appTitle
  const routeTitle = route.i18nKey ? translate(route.i18nKey) : route.title
  return `${routeTitle} - ${appTitle}`
}

export function syncNavigationProgress(active: boolean, enabled: boolean, progress: ProgressAdapter) {
  if (enabled && active) progress.start()
  else progress.done()
}

export function NavigationProgress({
  active,
  enabled = true,
  controller = navigationProgressController,
  source,
}: {
  active: boolean
  enabled?: boolean
  controller?: Pick<typeof navigationProgressController, "set">
  source?: string
}) {
  const generatedSource = useId()
  const progressSource = source ?? generatedSource

  useLayoutEffect(() => {
    controller.set(progressSource, enabled && active)
  }, [active, controller, enabled, progressSource])

  useLayoutEffect(() => {
    return () => {
      controller.set(progressSource, false)
    }
  }, [controller, progressSource])

  return null
}

export function RouteEffects() {
  const { t, i18n } = useTranslation()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const snapshot = useRouteStore((state) => state.snapshot)
  const normalizedRoute = findRouteForPath(snapshot, pathname)
  const route = normalizedRoute
    ? { title: normalizedRoute.title, ...(normalizedRoute.i18nKey ? { i18nKey: normalizedRoute.i18nKey } : {}) }
    : undefined
  const theme = useEffectiveThemeConfig()
  const revision = useRouteStore((state) => state.revision)
  const homeName = useRouteStore((state) => state.homeName)

  useEffect(() => {
    useTabStore.getState().syncAuthorizedRoutes(snapshot, homeName, (key) => t(key))
    const tabs = useTabStore.getState().tabs
    const result = reconcileRouteRuntime({
      snapshot,
      homeName,
      currentPathname: pathname,
      currentPathSearch: `${pathname}${search}`,
      tabs,
    })
    useRouteCacheStore.getState().reconcile(result.validCacheKeys)
    if (result.nextPath && result.nextPath !== pathname) navigate(result.nextPath, { replace: true })
  }, [homeName, i18n.language, navigate, pathname, revision, search, snapshot, t])

  useEffect(() => {
    document.title = resolveDocumentTitle(route, (key) => t(key), t("system.title"))
  }, [i18n.language, route, t])

  return <NavigationProgress active={navigation.state !== "idle"} enabled={theme.experience.navigationProgress} />
}

import type { CreateMenuBody, Menu } from "@/services/api/menu"

export type MenuOperation = "add" | "edit" | "addChild"
export interface MenuValues {
  menuType: Menu["menuType"]
  menuName: string
  routeName: string
  routePath: string
  pathParam: string
  layout: string
  page: string
  order: number
  i18nKey: string
  icon: string
  iconType: Menu["iconType"]
  parentId: string | null
  status: Menu["status"]
  keepAlive: boolean
  constant: boolean
  href: string
  hideInMenu: boolean
  activeMenu: string
  multiTab: boolean
  fixedIndexInTab: number | null
  query: Menu["query"]
  permission: string
}
export function createMenuValues(operation: MenuOperation, menu?: Menu | null): MenuValues {
  const defaults: MenuValues = {
    menuType: "1",
    menuName: "",
    routeName: "",
    routePath: "",
    pathParam: "",
    layout: "",
    page: "",
    order: 0,
    i18nKey: "",
    icon: "",
    iconType: "1",
    parentId: null,
    status: "1",
    keepAlive: false,
    constant: false,
    href: "",
    hideInMenu: false,
    activeMenu: "",
    multiTab: false,
    fixedIndexInTab: null,
    query: [],
    permission: "",
  }
  if (!menu) return defaults
  if (operation === "addChild") return { ...defaults, parentId: menu.id }
  if (operation !== "edit") return defaults
  const parts = menu.component?.split("$") ?? []
  const parameterIndex = menu.routePath.indexOf("/:")
  return {
    ...defaults,
    menuType: menu.menuType,
    menuName: menu.menuName,
    routeName: menu.routeName,
    routePath: parameterIndex < 0 ? menu.routePath : menu.routePath.slice(0, parameterIndex),
    pathParam: parameterIndex < 0 ? "" : menu.routePath.slice(parameterIndex + 2),
    layout: parts.find((x) => x.startsWith("layout."))?.slice(7) ?? "",
    page: parts.find((x) => x.startsWith("view."))?.slice(5) ?? "",
    order: menu.order,
    i18nKey: menu.i18nKey ?? "",
    icon: menu.icon ?? "",
    iconType: menu.iconType,
    parentId: menu.parentId ?? null,
    status: menu.status,
    keepAlive: menu.keepAlive,
    constant: menu.constant,
    href: menu.href ?? "",
    hideInMenu: menu.hideInMenu,
    activeMenu: menu.activeMenu ?? "",
    multiTab: menu.multiTab,
    fixedIndexInTab: menu.fixedIndexInTab ?? null,
    query: (menu.query ?? []).map((item) => ({ ...item })),
    permission: menu.permission ?? "",
  }
}
export function routeNameChanged(routeName: string) {
  return {
    routeName,
    routePath: routeName ? `/${routeName.replace(/_/g, "/")}` : "",
    i18nKey: routeName ? `route.${routeName}` : "",
  }
}
export function menuBody(values: MenuValues): CreateMenuBody {
  const { layout, page, pathParam, ...body } = values
  return {
    ...body,
    component: [layout && `layout.${layout}`, page && `view.${page}`].filter(Boolean).join("$"),
    routePath: body.routePath + (pathParam.trim() ? `/:${pathParam.trim()}` : ""),
    permission: body.menuType === "2" && !body.constant ? body.permission : null,
    activeMenu: body.menuType === "2" && body.hideInMenu ? body.activeMenu || null : null,
    query: body.query.filter((item) => item.key.trim()),
  }
}
export type MenuRow = Menu & { depth: number }
export function flattenMenus(menus: Menu[], expanded: Set<string>, depth = 0): MenuRow[] {
  return menus.flatMap((menu) => [
    { ...menu, depth },
    ...(expanded.has(menu.id) ? flattenMenus(menu.children ?? [], expanded, depth + 1) : []),
  ])
}

export function allMenuIds(menus: Menu[]): string[] {
  return menus.flatMap((menu) => [menu.id, ...allMenuIds(menu.children ?? [])])
}
export function toggleMenuSelection(menus: Menu[], selected: Record<string, boolean>, node: Menu, checked: boolean) {
  const next = { ...selected }
  for (const id of allMenuIds([node])) {
    if (checked) next[id] = true
    else delete next[id]
  }
  function normalize(menu: Menu): boolean {
    if (menu.children?.length) {
      const children = menu.children.map(normalize)
      if (children.every(Boolean)) next[menu.id] = true
      else delete next[menu.id]
    }
    return next[menu.id] === true
  }
  menus.forEach(normalize)
  return next
}

export type ThemeRuntimeOwner = "theme-provider" | "layout" | "menu" | "tabs" | "route-transition"

interface RuntimeThemeWorkbenchControl {
  field: string
  panel: "colors" | "design-system" | "layout" | "experience"
  kind: "runtime"
  runtimeOwner: ThemeRuntimeOwner
  observable: string
}

interface ExportOnlyThemeWorkbenchControl {
  field: string
  panel: "colors" | "design-system" | "layout" | "experience"
  kind: "export-only"
}

export type ThemeWorkbenchControl = RuntimeThemeWorkbenchControl | ExportOnlyThemeWorkbenchControl

/** Canonical list of every interactive theme workbench control. */
export const themeWorkbenchControls = [
  {
    field: "appearance.preset",
    panel: "colors",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "resolved semantic CSS variables",
  },
  {
    field: "appearance.customPrimary",
    panel: "colors",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "applied custom semantic CSS variables",
  },
  {
    field: "shadcn.style",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.base",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.baseColor",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.theme",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.chartColor",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.iconLibrary",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.font",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.fontHeading",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "appearance.radius",
    panel: "design-system",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root data-radius attribute",
  },
  {
    field: "shadcn.menuColor",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "shadcn.menuAccent",
    panel: "design-system",
    kind: "export-only",
  },
  {
    field: "layout.mode",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "layout",
    observable: "layout shell orientation and menu regions",
  },
  {
    field: "layout.sidebarVariant",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root data-sidebar attribute",
  },
  {
    field: "layout.density",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root data-density attribute",
  },
  {
    field: "layout.contentWidth",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root data-content-width attribute",
  },
  {
    field: "layout.fixedHeaderTabs",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "layout",
    observable: "layout shell header and tabs scroll ownership",
  },
  {
    field: "layout.showTabs",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "layout",
    observable: "page tabs region visibility",
  },
  {
    field: "layout.defaultSidebarCollapsed",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "layout",
    observable: "desktop sidebar initial collapse state",
  },
  {
    field: "sidebar.autoSelectFirstMenu",
    panel: "layout",
    kind: "runtime",
    runtimeOwner: "menu",
    observable: "branch selection opens the first navigable descendant",
  },
  {
    field: "experience.pageMotion",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "route-transition",
    observable: "route transition animation enablement",
  },
  {
    field: "experience.motionPreset",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "route-transition",
    observable: "route transition animation class",
  },
  {
    field: "experience.navigationProgress",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "route-transition",
    observable: "navigation progress visibility while routes load",
  },
  {
    field: "experience.middleClickCloseTab",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "tabs",
    observable: "middle-click closes a closable page tab",
  },
  {
    field: "experience.restoreTabs",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "tabs",
    observable: "page tabs persistence after refresh",
  },
  {
    field: "experience.grayscale",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root grayscale filter",
  },
  {
    field: "experience.colorVisionAssist",
    panel: "experience",
    kind: "runtime",
    runtimeOwner: "theme-provider",
    observable: "document root color-vision filter",
  },
] as const satisfies readonly ThemeWorkbenchControl[]

export type ThemeWorkbenchField = (typeof themeWorkbenchControls)[number]["field"]
export type ThemeWorkbenchRuntimeField = Extract<(typeof themeWorkbenchControls)[number], { kind: "runtime" }>["field"]

export interface ThemeCapability {
  field: ThemeWorkbenchRuntimeField
  runtimeOwner: ThemeRuntimeOwner
  observable: string
}

export const themeCapabilities: readonly ThemeCapability[] = themeWorkbenchControls.flatMap((control) =>
  control.kind === "runtime"
    ? [{ field: control.field, runtimeOwner: control.runtimeOwner, observable: control.observable }]
    : [],
)

export const themeWorkbenchRuntimeFields = themeCapabilities.map(({ field }) => field)

const controlsByField = new Map<ThemeWorkbenchField, ThemeWorkbenchControl>(
  themeWorkbenchControls.map((control) => [control.field, control]),
)

export function getThemeWorkbenchControl(field: ThemeWorkbenchField): ThemeWorkbenchControl {
  return controlsByField.get(field)!
}

export function hasThemeCapability(field: ThemeWorkbenchField): boolean {
  return getThemeWorkbenchControl(field).kind === "runtime"
}

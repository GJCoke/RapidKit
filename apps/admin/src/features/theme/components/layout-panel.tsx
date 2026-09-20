import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { useAppStore } from "@/stores/app"
import { useTranslation } from "react-i18next"
import type { LayoutMode } from "../theme-config"
import { LayoutModeCard } from "./layout-mode-card"
import { ThemeRow, ThemeSection, ThemeSelect, ThemeSwitch, ThemeWorkbenchControl } from "./theme-fields"

export function LayoutPanel() {
  const { t } = useTranslation()
  const { draft, updateLayout, updateSidebar } = useThemeWorkbenchStore()
  const isMobile = useAppStore((state) => state.isMobile)
  const layout = draft.layout
  const modes: Array<{ mode: LayoutMode; label: string }> = [
    { mode: "vertical", label: t("theme.layout.vertical") },
    { mode: "vertical-mix", label: t("theme.layout.verticalMix") },
    { mode: "vertical-hybrid-header-first", label: t("theme.layout.verticalHybridHeaderFirst") },
    { mode: "horizontal", label: t("theme.layout.horizontal") },
    { mode: "top-hybrid-sidebar-first", label: t("theme.layout.topHybridSidebarFirst") },
    { mode: "top-hybrid-header-first", label: t("theme.layout.topHybridHeaderFirst") },
  ]
  return (
    <ThemeSection title={t("theme.layout.title")} description={t("theme.layout.description")}>
      <ThemeWorkbenchControl field="layout.mode">
        <div role="radiogroup" aria-label={t("theme.layout.mode")} className="grid grid-cols-2 gap-2">
          {modes.map(({ mode, label }) => (
            <LayoutModeCard
              key={mode}
              mode={mode}
              label={label}
              selected={layout.mode === mode}
              disabled={isMobile}
              onSelect={(nextMode) => updateLayout({ mode: nextMode })}
            />
          ))}
        </div>
      </ThemeWorkbenchControl>
      <ThemeRow field="layout.sidebarVariant" label={t("theme.layout.sidebarVariant")}>
        <ThemeSelect
          label={t("theme.layout.sidebarVariant")}
          value={layout.sidebarVariant}
          options={[
            { value: "standard", label: t("theme.layout.sidebarStandard") },
            { value: "floating", label: t("theme.layout.sidebarFloating") },
            { value: "inset", label: t("theme.layout.sidebarInset") },
          ]}
          onChange={(sidebarVariant) =>
            updateLayout({ sidebarVariant: sidebarVariant as typeof layout.sidebarVariant })
          }
        />
      </ThemeRow>
      <ThemeRow field="layout.density" label={t("theme.layout.density")}>
        <ThemeSelect
          label={t("theme.layout.density")}
          value={layout.density}
          options={[
            { value: "compact", label: t("theme.layout.densityCompact") },
            { value: "comfortable", label: t("theme.layout.densityComfortable") },
          ]}
          onChange={(density) => updateLayout({ density: density as typeof layout.density })}
        />
      </ThemeRow>
      <ThemeRow field="layout.contentWidth" label={t("theme.layout.contentWidth")}>
        <ThemeSelect
          label={t("theme.layout.contentWidth")}
          value={layout.contentWidth}
          options={[
            { value: "fluid", label: t("theme.layout.contentFluid") },
            { value: "centered", label: t("theme.layout.contentCentered") },
          ]}
          onChange={(contentWidth) => updateLayout({ contentWidth: contentWidth as typeof layout.contentWidth })}
        />
      </ThemeRow>
      <ThemeRow field="layout.fixedHeaderTabs" label={t("theme.layout.fixedHeaderTabs")}>
        <ThemeSwitch
          label={t("theme.layout.fixedHeaderTabs")}
          checked={layout.fixedHeaderTabs}
          onCheckedChange={(fixedHeaderTabs) => updateLayout({ fixedHeaderTabs })}
        />
      </ThemeRow>
      <ThemeRow field="layout.showTabs" label={t("theme.layout.showTabs")}>
        <ThemeSwitch
          label={t("theme.layout.showTabs")}
          checked={layout.showTabs}
          onCheckedChange={(showTabs) => updateLayout({ showTabs })}
        />
      </ThemeRow>
      <ThemeRow field="layout.defaultSidebarCollapsed" label={t("theme.layout.defaultSidebarCollapsed")}>
        <ThemeSwitch
          label={t("theme.layout.defaultSidebarCollapsed")}
          checked={layout.defaultSidebarCollapsed}
          onCheckedChange={(defaultSidebarCollapsed) => updateLayout({ defaultSidebarCollapsed })}
        />
      </ThemeRow>
      <ThemeRow field="sidebar.autoSelectFirstMenu" label={t("theme.layout.autoSelectFirstMenu")}>
        <ThemeSwitch
          label={t("theme.layout.autoSelectFirstMenu")}
          checked={draft.sidebar.autoSelectFirstMenu}
          onCheckedChange={(autoSelectFirstMenu) => updateSidebar({ autoSelectFirstMenu })}
        />
      </ThemeRow>
    </ThemeSection>
  )
}

import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { useTranslation } from "react-i18next"
import { themeWorkbenchOptions } from "../theme-presets"
import { ThemeRow, ThemeSection, ThemeSelect } from "./theme-fields"

const localizedOptions = (t: (key: string) => string, keyPrefix: string, values: readonly string[]) =>
  values.map((value) => ({
    value,
    label: t(`${keyPrefix}${value.replace(/^./, (character) => character.toUpperCase())}`),
  }))

export function DesignSystemPanel() {
  const { t } = useTranslation()
  const { draft, updateShadcn, updateAppearance } = useThemeWorkbenchStore()
  const exportOnlyHint = t("theme.designSystem.exportOnly")
  return (
    <div className="flex flex-col gap-3">
      <ThemeSection title={t("theme.designSystem.title")} description={t("theme.designSystem.description")}>
        <ThemeRow field="shadcn.style" label={t("theme.designSystem.style")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.style")}
            value={draft.shadcn.style}
            options={localizedOptions(t, "theme.designSystem.style", themeWorkbenchOptions.styles)}
            onChange={(style) => updateShadcn({ style: style as typeof draft.shadcn.style })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.base" label={t("theme.designSystem.primitiveBase")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.primitiveBase")}
            disabled
            value="base"
            options={[{ value: "base", label: t("theme.designSystem.baseUi") }]}
            onChange={() => undefined}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.baseColor" label={t("theme.designSystem.baseColor")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.baseColor")}
            value={draft.shadcn.baseColor}
            options={localizedOptions(t, "theme.designSystem.baseColor", themeWorkbenchOptions.baseColors)}
            onChange={(baseColor) => updateShadcn({ baseColor })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.theme" label={t("theme.designSystem.theme")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.theme")}
            value={draft.shadcn.theme}
            options={localizedOptions(t, "theme.designSystem.color", themeWorkbenchOptions.themes)}
            onChange={(theme) => updateShadcn({ theme })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.chartColor" label={t("theme.designSystem.chartColor")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.chartColor")}
            value={draft.shadcn.chartColor}
            options={localizedOptions(t, "theme.designSystem.color", themeWorkbenchOptions.chartColors)}
            onChange={(chartColor) => updateShadcn({ chartColor })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.iconLibrary" label={t("theme.designSystem.iconLibrary")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.iconLibrary")}
            value={draft.shadcn.iconLibrary}
            options={localizedOptions(t, "theme.designSystem.icon", themeWorkbenchOptions.icons)}
            onChange={(iconLibrary) => updateShadcn({ iconLibrary })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.font" label={t("theme.designSystem.bodyFont")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.bodyFont")}
            value={draft.shadcn.font}
            options={localizedOptions(t, "theme.designSystem.font", themeWorkbenchOptions.fonts)}
            onChange={(font) => updateShadcn({ font })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.fontHeading" label={t("theme.designSystem.headingFont")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.headingFont")}
            value={draft.shadcn.fontHeading}
            options={themeWorkbenchOptions.headingFonts.map((value) => ({
              value,
              label:
                value === "inherit"
                  ? t("theme.designSystem.inheritBodyFont")
                  : t(`theme.designSystem.font${value.replace(/^./, (character) => character.toUpperCase())}`),
            }))}
            onChange={(fontHeading) => updateShadcn({ fontHeading })}
          />
        </ThemeRow>
        <ThemeRow field="appearance.radius" label={t("theme.designSystem.radius")}>
          <ThemeSelect
            label={t("theme.designSystem.radius")}
            value={draft.appearance.radius}
            options={[
              { value: "compact", label: t("theme.designSystem.radiusCompact") },
              { value: "default", label: t("theme.designSystem.radiusDefault") },
              { value: "soft", label: t("theme.designSystem.radiusSoft") },
            ]}
            onChange={(radius) => updateAppearance({ radius: radius as typeof draft.appearance.radius })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.menuColor" label={t("theme.designSystem.menuColor")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.menuColor")}
            value={draft.shadcn.menuColor}
            options={[
              { value: "default", label: t("theme.designSystem.menuColorDefault") },
              { value: "muted", label: t("theme.designSystem.menuColorMuted") },
              { value: "inverted", label: t("theme.designSystem.menuColorInverted") },
            ]}
            onChange={(menuColor) => updateShadcn({ menuColor })}
          />
        </ThemeRow>
        <ThemeRow field="shadcn.menuAccent" label={t("theme.designSystem.menuAccent")} hint={exportOnlyHint}>
          <ThemeSelect
            label={t("theme.designSystem.menuAccent")}
            value={draft.shadcn.menuAccent}
            options={[
              { value: "subtle", label: t("theme.designSystem.menuAccentSubtle") },
              { value: "bold", label: t("theme.designSystem.menuAccentBold") },
            ]}
            onChange={(menuAccent) => updateShadcn({ menuAccent })}
          />
        </ThemeRow>
      </ThemeSection>
    </div>
  )
}

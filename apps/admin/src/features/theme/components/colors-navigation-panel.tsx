import { Button } from "@rapidkit/ui/components/button"
import { Input } from "@rapidkit/ui/components/input"
import { useTranslation } from "react-i18next"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { themePresets } from "../theme-presets"
import { createCustomThemeTokens } from "../theme-color"
import { defaultThemeConfig } from "../theme-config"
import { ThemeSection, ThemeWorkbenchControl } from "./theme-fields"

export function ColorsNavigationPanel() {
  const { t } = useTranslation()
  const { draft, applyPreset, updateAppearance } = useThemeWorkbenchStore()
  const custom = draft.appearance.customPrimary ?? ""
  const generated = createCustomThemeTokens(custom, defaultThemeConfig.tokens)
  return (
    <ThemeSection title={t("theme.colors.title")} description={t("theme.colors.description")}>
      <ThemeWorkbenchControl field="appearance.preset" className="grid grid-cols-2 gap-2">
        {Object.entries(themePresets).map(([id, preset]) => (
          <Button
            key={id}
            variant={draft.appearance.preset === id ? "default" : "outline"}
            onClick={() => applyPreset(id, preset.tokens)}
          >
            <span className="size-3 rounded-full" style={{ background: preset.tokens.light.primary }} />
            {t(preset.labelKey)}
          </Button>
        ))}
      </ThemeWorkbenchControl>
      <div className="grid grid-cols-5 gap-2 rounded-lg bg-muted p-3">
        {[1, 2, 3, 4, 5].map((number) => (
          <span key={number} className="h-10 rounded-md" style={{ background: `var(--chart-${number})` }} />
        ))}
      </div>
      <ThemeWorkbenchControl field="appearance.customPrimary" className="flex gap-2">
        <Input
          aria-label={t("theme.colors.customPrimary")}
          placeholder="#4f46e5"
          value={custom}
          onChange={(event) => updateAppearance({ customPrimary: event.target.value })}
        />
        <Button disabled={!generated} onClick={() => generated && applyPreset("custom", generated.tokens)}>
          {t("theme.colors.previewCustom")}
        </Button>
      </ThemeWorkbenchControl>
      {custom && (
        <p className={generated ? "text-xs text-success" : "text-xs text-destructive"}>
          {generated
            ? t("theme.colors.contrast", { value: generated.contrast.light.toFixed(2) })
            : t("theme.colors.invalidColor")}
        </p>
      )}
    </ThemeSection>
  )
}

import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { useTranslation } from "react-i18next"
import { ThemeRow, ThemeSection, ThemeSelect, ThemeSwitch } from "./theme-fields"

export function ExperiencePanel() {
  const { t } = useTranslation()
  const { draft, updateExperience } = useThemeWorkbenchStore()
  const value = draft.experience
  return (
    <ThemeSection title={t("theme.experience.title")} description={t("theme.experience.description")}>
      <ThemeRow field="experience.pageMotion" label={t("theme.experience.pageMotion")}>
        <ThemeSwitch
          label={t("theme.experience.pageMotion")}
          checked={value.pageMotion}
          onCheckedChange={(pageMotion) => updateExperience({ pageMotion })}
        />
      </ThemeRow>
      <ThemeRow field="experience.motionPreset" label={t("theme.experience.motionPreset")}>
        <ThemeSelect
          label={t("theme.experience.motionPreset")}
          value={value.motionPreset}
          options={[
            { value: "fade-slide", label: t("theme.experience.fadeSlide") },
            { value: "fade", label: t("theme.experience.fade") },
            { value: "zoom-fade", label: t("theme.experience.zoomFade") },
          ]}
          onChange={(motionPreset) => updateExperience({ motionPreset: motionPreset as typeof value.motionPreset })}
        />
      </ThemeRow>
      <ThemeRow field="experience.navigationProgress" label={t("theme.experience.navigationProgress")}>
        <ThemeSwitch
          label={t("theme.experience.navigationProgress")}
          checked={value.navigationProgress}
          onCheckedChange={(navigationProgress) => updateExperience({ navigationProgress })}
        />
      </ThemeRow>
      <ThemeRow field="experience.middleClickCloseTab" label={t("theme.experience.middleClickCloseTab")}>
        <ThemeSwitch
          label={t("theme.experience.middleClickCloseTab")}
          checked={value.middleClickCloseTab}
          onCheckedChange={(middleClickCloseTab) => updateExperience({ middleClickCloseTab })}
        />
      </ThemeRow>
      <ThemeRow field="experience.restoreTabs" label={t("theme.experience.restoreTabs")}>
        <ThemeSwitch
          label={t("theme.experience.restoreTabs")}
          checked={value.restoreTabs}
          onCheckedChange={(restoreTabs) => updateExperience({ restoreTabs })}
        />
      </ThemeRow>
      <ThemeRow field="experience.grayscale" label={t("theme.experience.grayscale")}>
        <ThemeSwitch
          label={t("theme.experience.grayscale")}
          checked={value.grayscale}
          onCheckedChange={(grayscale) => updateExperience({ grayscale })}
        />
      </ThemeRow>
      <ThemeRow field="experience.colorVisionAssist" label={t("theme.experience.colorVisionAssist")}>
        <ThemeSwitch
          label={t("theme.experience.colorVisionAssist")}
          checked={value.colorVisionAssist}
          onCheckedChange={(colorVisionAssist) => updateExperience({ colorVisionAssist })}
        />
      </ThemeRow>
    </ThemeSection>
  )
}

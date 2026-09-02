import { useTranslation } from "react-i18next"
import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@rapidkit/ui/components/button"
import { useThemeStore } from "@/stores/theme"

export function ThemeToggle() {
  const { t } = useTranslation()
  const { colorScheme, toggleScheme } = useThemeStore()
  const Icon = colorScheme === "dark" ? Moon : colorScheme === "auto" ? Monitor : Sun

  return (
    <Button type="button" variant="ghost" size="icon" aria-label={t("layout.toggleTheme")} onClick={toggleScheme}>
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  )
}

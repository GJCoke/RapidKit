import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@rapidkit/ui/components/dropdown-menu"

import { APP_LOCALES } from "./locale-model"
import { useLocaleStore } from "@/stores/locale"

export function LocaleSwitch() {
  const { t } = useTranslation()
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon" />}
        aria-label={t("layout.switchLanguage")}
      >
        <Languages className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {APP_LOCALES.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={option.key === locale}
            onClick={() => setLocale(option.key)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

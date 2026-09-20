import { useEffect } from "react"

import i18n from "@/locales"
import { useLocaleStore } from "@/stores/locale"

export function LocaleSync() {
  const locale = useLocaleStore((state) => state.locale)

  useEffect(() => {
    void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
  }, [locale])

  return null
}

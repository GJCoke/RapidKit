import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enUS from "./en-US/common.json"
import zhCN from "./zh-CN/common.json"

const defaultLocale = import.meta.env.VITE_I18N_DEFAULT_LOCALE || "zh-CN"

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
  },
  lng: defaultLocale,
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

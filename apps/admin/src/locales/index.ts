import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { useLocaleStore } from "@/stores/locale"
import enUSNotification from "./en-US/notification.json"
import zhCNNotification from "./zh-CN/notification.json"

import enUSAudit from "./en-US/audit.json"
import zhCNAudit from "./zh-CN/audit.json"

import enUSMenu from "./en-US/menu.json"
import zhCNMenu from "./zh-CN/menu.json"

import enUSRole from "./en-US/role.json"
import zhCNRole from "./zh-CN/role.json"

import enUS from "./en-US/common.json"
import enUSDatatable from "./en-US/datatable.json"
import enUSForm from "./en-US/form.json"
import enUSRequest from "./en-US/request.json"
import enUSRoute from "./en-US/route.json"
import enUSTheme from "./en-US/theme.json"
import zhCN from "./zh-CN/common.json"
import zhCNDatatable from "./zh-CN/datatable.json"
import zhCNForm from "./zh-CN/form.json"
import zhCNRequest from "./zh-CN/request.json"
import zhCNRoute from "./zh-CN/route.json"
import zhCNTheme from "./zh-CN/theme.json"

const defaultLocale = useLocaleStore.getState().locale

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": {
      translation: {
        ...zhCN,
        ...zhCNRoute,
        ...zhCNRequest,
        ...zhCNForm,
        ...zhCNDatatable,
        ...zhCNTheme,
        ...zhCNRole,
        ...zhCNMenu,
        ...zhCNAudit,
        ...zhCNNotification,
      },
    },
    "en-US": {
      translation: {
        ...enUS,
        ...enUSRoute,
        ...enUSRequest,
        ...enUSForm,
        ...enUSDatatable,
        ...enUSTheme,
        ...enUSRole,
        ...enUSMenu,
        ...enUSAudit,
        ...enUSNotification,
      },
    },
  },
  lng: defaultLocale,
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

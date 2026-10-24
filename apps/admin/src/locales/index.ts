import enUSHome from "./en-US/home.json"
import zhCNHome from "./zh-CN/home.json"
import enUSAccount from "./en-US/account.json"
import zhCNAccount from "./zh-CN/account.json"
import enUSUsers from "./en-US/users.json"
import zhCNUsers from "./zh-CN/users.json"
import enUSSocketInstrument from "./en-US/socket-instrument.json"
import zhCNSocketInstrument from "./zh-CN/socket-instrument.json"
import enUSSocketDebug from "./en-US/socket-debug.json"
import zhCNSocketDebug from "./zh-CN/socket-debug.json"
import enUSSocketChat from "./en-US/socket-chat.json"
import zhCNSocketChat from "./zh-CN/socket-chat.json"
import enUSPluginMonitoring from "./en-US/plugin-monitoring.json"
import zhCNPluginMonitoring from "./zh-CN/plugin-monitoring.json"
import enUSApiMonitoring from "./en-US/api-monitoring.json"
import zhCNApiMonitoring from "./zh-CN/api-monitoring.json"
import enUSSchedule from "./en-US/schedule.json"
import zhCNSchedule from "./zh-CN/schedule.json"
import enUSTask from "./en-US/task.json"
import zhCNTask from "./zh-CN/task.json"
import enUSQueueDashboard from "./en-US/queue-dashboard.json"
import zhCNQueueDashboard from "./zh-CN/queue-dashboard.json"
import enUSPreference from "./en-US/notification-preference.json"
import zhCNPreference from "./zh-CN/notification-preference.json"
import enUSDelivery from "./en-US/notification-delivery.json"
import zhCNDelivery from "./zh-CN/notification-delivery.json"
import enUSTemplate from "./en-US/notification-template.json"
import zhCNTemplate from "./zh-CN/notification-template.json"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { useLocaleStore } from "@/stores/locale"
import enUSAnnouncement from "./en-US/announcement.json"
import zhCNAnnouncement from "./zh-CN/announcement.json"
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
        ...zhCNAnnouncement,
        ...zhCNTemplate,
        ...zhCNDelivery,
        ...zhCNPreference,
        ...zhCNQueueDashboard,
        ...zhCNTask,
        ...zhCNSchedule,
        ...zhCNApiMonitoring,
        ...zhCNPluginMonitoring,
        ...zhCNSocketChat,
        ...zhCNSocketDebug,
        ...zhCNSocketInstrument,
        ...zhCNUsers,
        ...zhCNAccount,
        ...zhCNHome,
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
        ...enUSAnnouncement,
        ...enUSTemplate,
        ...enUSDelivery,
        ...enUSPreference,
        ...enUSQueueDashboard,
        ...enUSTask,
        ...enUSSchedule,
        ...enUSApiMonitoring,
        ...enUSPluginMonitoring,
        ...enUSSocketChat,
        ...enUSSocketDebug,
        ...enUSSocketInstrument,
        ...enUSUsers,
        ...enUSAccount,
        ...enUSHome,
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

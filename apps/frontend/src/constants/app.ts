import { transformRecordToOption } from "@/utils/common"

export const GLOBAL_HEADER_MENU_ID = "__GLOBAL_HEADER_MENU__"

export const GLOBAL_SIDER_MENU_ID = "__GLOBAL_SIDER_MENU__"

export const themeSchemaRecord: Record<UnionKey.ThemeScheme, I18nFullKey> = {
  light: "theme.appearance.themeSchema.light",
  dark: "theme.appearance.themeSchema.dark",
  auto: "theme.appearance.themeSchema.auto",
}

export const themeSchemaOptions = transformRecordToOption(themeSchemaRecord)

export const loginModuleRecord: Record<UnionKey.LoginModule, I18nFullKey> = {
  "pwd-login": "page.login.pwdLogin.title",
  "code-login": "page.login.codeLogin.title",
  register: "page.login.register.title",
  "reset-pwd": "page.login.resetPwd.title",
  "bind-wechat": "page.login.bindWeChat.title",
}

export const themeLayoutModeRecord: Record<UnionKey.ThemeLayoutMode, I18nFullKey> = {
  vertical: "theme.layout.layoutMode.vertical",
  "vertical-mix": "theme.layout.layoutMode.vertical-mix",
  "vertical-hybrid-header-first": "theme.layout.layoutMode.vertical-hybrid-header-first",
  horizontal: "theme.layout.layoutMode.horizontal",
  "top-hybrid-sidebar-first": "theme.layout.layoutMode.top-hybrid-sidebar-first",
  "top-hybrid-header-first": "theme.layout.layoutMode.top-hybrid-header-first",
}

export const themeLayoutModeOptions = transformRecordToOption(themeLayoutModeRecord)

export const themeScrollModeRecord: Record<UnionKey.ThemeScrollMode, I18nFullKey> = {
  wrapper: "theme.layout.content.scrollMode.wrapper",
  content: "theme.layout.content.scrollMode.content",
}

export const themeScrollModeOptions = transformRecordToOption(themeScrollModeRecord)

export const themeTabModeRecord: Record<UnionKey.ThemeTabMode, I18nFullKey> = {
  chrome: "theme.layout.tab.mode.chrome",
  button: "theme.layout.tab.mode.button",
  slider: "theme.layout.tab.mode.slider",
}

export const themeTabModeOptions = transformRecordToOption(themeTabModeRecord)

export const themePageAnimationModeRecord: Record<UnionKey.ThemePageAnimateMode, I18nFullKey> = {
  "fade-slide": "theme.layout.content.page.mode.fade-slide",
  fade: "theme.layout.content.page.mode.fade",
  "fade-bottom": "theme.layout.content.page.mode.fade-bottom",
  "fade-scale": "theme.layout.content.page.mode.fade-scale",
  "zoom-fade": "theme.layout.content.page.mode.zoom-fade",
  "zoom-out": "theme.layout.content.page.mode.zoom-out",
  none: "theme.layout.content.page.mode.none",
}

export const themePageAnimationModeOptions = transformRecordToOption(themePageAnimationModeRecord)

export const DARK_CLASS = "dark"

export const watermarkTimeFormatOptions = [
  { label: "YYYY-MM-DD HH:mm", value: "YYYY-MM-DD HH:mm" },
  { label: "YYYY-MM-DD HH:mm:ss", value: "YYYY-MM-DD HH:mm:ss" },
  { label: "YYYY/MM/DD HH:mm", value: "YYYY/MM/DD HH:mm" },
  { label: "YYYY/MM/DD HH:mm:ss", value: "YYYY/MM/DD HH:mm:ss" },
  { label: "HH:mm", value: "HH:mm" },
  { label: "HH:mm:ss", value: "HH:mm:ss" },
  { label: "MM-DD HH:mm", value: "MM-DD HH:mm" },
]

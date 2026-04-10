import DefaultTheme from "vitepress/theme"
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
// @ts-expect-error ...
import "./styles/index.css"

export default {
  extends: DefaultTheme,
  // @ts-expect-error ...
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
  },
}
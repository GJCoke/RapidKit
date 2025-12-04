import { defineConfig } from "vitepress"
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs"

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "src",
  title: "Monorepo Example",
  description: "A monorepo example docs.",
  lang: "zh-CN",
  lastUpdated: true,
  vite: {
    server: {
      host: "0.0.0.0",
      port: 9628,
    }
  },
  locales: {
    root: {
      label: "简体中文",
      lang: "zh-CN",
      themeConfig: {
        nav: [
          { text: "指南", link: "/guide/", activeMatch: "^/guide/" },
          { text: "前端", link: "/frontend/", activeMatch: "^/frontend/" },
          { text: "桌面端", link: "/desktop/home", activeMatch: "^/desktop/" },
          { text: "后端", link: "/backend/i18n", activeMatch: "^/backend/" },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "开始",
              items: [
                { text: "简介", link: "/guide/", },
                { text: "快速开始", link: "/guide/started/installation" }
              ]
            }
          ],
          "/backend/": [
            {
              text: "Python",
              items: [
                { text: "国际化", link: "/backend/i18n" },
                { text: "Getting Started", link: "/backend/examples" },
                { text: "Podman 更新国内源", link: "/backend/docker" }
              ],
            },
          ],
        },
      },
    },
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/en/" },
          { text: "Frontend", link: "/en/frontend/home" },
          { text: "Desktop", link: "/en/desktop/home" },
          { text: "Backend", link: "/en/backend/i18n" },
        ],
        sidebar: {
          "/en/backend/": [
            {
              text: "Python",
              items: [
                { text: "i18n", link: "/en/backend/i18n" },
                { text: "Getting Started", link: "/en/backend/examples" },
              ],
            },
          ],
        },
      },
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索文档",
                buttonAriaLabel: "搜索文档",
              },
              modal: {
                noResultsText: "无法找到相关结果",
                resetButtonTitle: "清除查询条件",
                footer: {
                  selectText: "选择",
                  navigateText: "切换",
                  closeText: "关闭",
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: "github", link: "https://github.com/GJCoke/monorepo-example" }],
  },
  markdown: {
    config(md) {
      md.use(tabsMarkdownPlugin)
    }
  }
})

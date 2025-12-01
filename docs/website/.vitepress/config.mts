import { defineConfig } from "vitepress"

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "src",
  title: "Monorepo Example",
  description: "A monorepo example docs.",
  lang: "zh-CN",
  lastUpdated: true,
  locales: {
    root: {
      label: "简体中文",
      lang: "zh-CN",
      themeConfig: {
        nav: [
          { text: "指南", link: "/" },
          { text: "前端", link: "/web/home" },
          { text: "桌面端", link: "/desktop/home" },
          { text: "后端", link: "/backend/i18n" },
        ],
        sidebar: {
          "/backend/": [
            {
              text: "Python",
              items: [
                { text: "国际化", link: "/backend/i18n" },
                { text: "Getting Started", link: "/backend/examples" },
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
          { text: "Web", link: "/en/web/home" },
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
})

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
          { text: "指引", link: "/guide/", activeMatch: "^/guide/" },
          { text: "前端", link: "/frontend/", activeMatch: "^/frontend/" },
          { text: "桌面端", link: "/desktop/", activeMatch: "^/desktop/" },
          { text: "后端", link: "/backend/i18n", activeMatch: "^/backend/" },
          { text: "教程", link: "/tutorial/", activeMatch: "^/tutorial/" },
          { text: "更新日志", link: "/changelog/backend-CHANGELOG", activeMatch: "^/changelog/" },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "项目概述",
              items: [
                { text: "项目介绍", link: "/guide/", },
                { text: "快速开始", link: "/guide/quickstart" },
              ]
            },
            {
              text: "项目结构与架构设计",
              items: [
                { text: "目录结构概览", link: "/guide/overview" },
                { text: "架构设计", link: "/guide/design" },
              ]
            },
            {
              text: "静态检查工具",
              items: [
                { text: "ESLint 配置与使用", link: "/guide/eslint" },
                { text: "Mypy 配置与使用", link: "/guide/mypy" },
                { text: "TypeScript 检查", link: "/guide/tsc" },
                { text: "拼写检查工具", link: "/guide/spellcheck" },
              ]
            },
            {
              text: "格式化工具",
              items: [
                { text: "Prettier 配置与使用", link: "/guide/prettier" },
                { text: "Ruff 配置与使用", link: "/guide/ruff" },
              ]
            },
            {
              text: "Git 提交规范",
              items: [
                { text: "Husky 提交钩子配置", link: "/guide/husky" },
                { text: "Lint-staged 配置", link: "/guide/lint-staged" },
                { text: "Commitlint 提交信息规范", link: "/guide/commitlint" },
              ]
            },
            {
              text: "更新日志",
              items: [
                { text: "Changesets 配置与使用", link: "/guide/changeset" },
                { text: "更新日志模板", link: "/guide/changelog" },
              ]
            },
            {
              text: "类型生成",
              items: [
                { text: "API 类型自动生成", link: "/guide/openapi-types" },
                { text: "I18n 类型自动生成", link: "/guide/i18n-types" },
              ]
            },
            {
              text: "部署",
              items: [
                { text: "部署", link: "/guide/deployment" },
              ]
            },
          ],
          "/frontend/": [
            {
              text: "开始",
              items: [
                { text: "前端概览", link: "/frontend/overview" },
                { text: "技术栈", link: "/frontend/tech-stack" },
                { text: "API Service", link: "/frontend/api-service" },
                { text: "i18n", link: "/frontend/i18n" },
                { text: "UI 结构", link: "/frontend/ui" },
                { text: "构建", link: "/frontend/build" },
                { text: "Vite 插件", link: "/frontend/vite-plugins" }
              ]
            }
          ],
          "/backend/": [
            {
              text: "项目概述",
              items: [
                { text: "项目介绍", link: "/backend/", },
                { text: "快速开始", link: "/backend/quickstart" },
              ]
            },
            {
              text: "项目结构与架构设计",
              items: [
                { text: "目录结构概览", link: "/backend/overview" },
                { text: "架构设计", link: "/backend/design" },
              ]
            },
            {
              text: "核心模块说明",
              items: [
                { text: "数据库与依赖注入", link: "/modules/database" },
                { text: "WebSocket 服务", link: "/modules/websocket" },
                { text: "异步任务调度（Celery）", link: "/modules/celery" },
                { text: "用户认证与授权", link: "/modules/auth" },
                { text: "工具链与代码质量", link: "/modules/toolchain" },
              ]
            },
            {
              text: "开发规范",
              items: [
                { text: "代码风格与格式化", link: "/guide/code-style" },
                { text: "静态检查工具使用", link: "/guide/static-check" },
              ]
            },
            {
              text: "测试与部署",
              items: [
                { text: "单元测试与覆盖率", link: "/guide/testing" },
                { text: "CI/CD 工作流", link: "/guide/ci" },
                { text: "部署指南", link: "/guide/deployment" },
              ]
            },
            {
              text: "Python",
              items: [
                { text: "国际化", link: "/backend/i18n" },
                { text: "Getting Started", link: "/backend/examples" },
                { text: "Podman 更新国内源", link: "/backend/docker" },
                { text: "后端概览", link: "/backend/overview" },
                { text: "目录结构", link: "/backend/project-structure" },
                { text: "OpenAPI Schema", link: "/backend/openapi" },
                { text: "模型定义", link: "/backend/pydantic-models" },
                { text: "代码检查", link: "/backend/quality" },
              ],
            },
          ],
          "/desktop/": [
            {
              text: "Python",
              items: [
                { text: "Electron 概览", link: "/desktop/overview" },
                { text: "Preload", link: "/desktop/preload" },
                { text: "IPC 机制", link: "/desktop/ipc" },
                { text: "打包", link: "/desktop/packaging" }
              ],
            },
          ],
          "/desktop/": [
            {
              text: "Python",
              items: [
                { text: "快速开始", link: "/tutorial/setup" },
                { text: "创建接口", link: "/tutorial/create-api" },
                { text: "创建页面", link: "/tutorial/create-page" },
                { text: "新增 i18n", link: "/tutorial/add-i18n" },
                { text: "常见问题", link: "/tutorial/troubleshooting" },
              ],
            },
          ],
          "/changelog/": [
            {
              text: "Apps",
              items: [
                { text: "Backend", link: "/changelog/backend-CHANGELOG" },
                { text: "Frontend", link: "/changelog/frontend-CHANGELOG" },
                { text: "Desktop", link: "/changelog/desktop-CHANGELOG" },
                { text: "Website", link: "/changelog/website-CHANGELOG" },
              ],
            },
            {
              text: "Packages",
              items: [
                { text: "Axios", link: "/changelog/axios-CHANGELOG" },
                { text: "Alova", link: "/changelog/alova-CHANGELOG" },
                { text: "Builder", link: "/changelog/builder-CHANGELOG" },
                { text: "Color", link: "/changelog/color-CHANGELOG" },
                { text: "Utils", link: "/changelog/utils-CHANGELOG" },
                { text: "Hooks", link: "/changelog/hooks-CHANGELOG" },
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
          { text: "Tutorial", link: "/en/tutorial/", activeMatch: "^/tutorial/" },
          { text: "Changelog", link: "/changelog/backend-CHANGELOG", activeMatch: "^/changelog/" },
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

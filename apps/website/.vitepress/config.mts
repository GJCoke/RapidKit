import {defineConfig} from "vitepress"
import {tabsMarkdownPlugin} from "vitepress-plugin-tabs"

export default defineConfig({
    srcDir: "src",
    title: "RapidKit",
    description: "TypeScript & Python Monorepo 全栈项目文档",
    lang: "zh-CN",
    lastUpdated: true,
    head: [
        ["link", {rel: "icon", type: "image/svg+xml", href: "/logo.svg"}],
    ],
    vite: {
        server: {
            host: "0.0.0.0",
            port: 9628,
        },
    },
    locales: {
        root: {
            label: "简体中文",
            lang: "zh-CN",
            themeConfig: {
                nav: [
                    {text: "快速开始", link: "/guide/introduction", activeMatch: "^/guide/"},
                    {text: "架构", link: "/architecture/overview", activeMatch: "^/architecture/"},
                    {text: "前端", link: "/frontend/tech-stack", activeMatch: "^/frontend/"},
                    {text: "后端", link: "/backend/tech-stack", activeMatch: "^/backend/"},
                    {text: "部署", link: "/deploy/docker", activeMatch: "^/deploy/"},
                    {
                        text: "更多",
                        items: [
                            {text: "桌面端", link: "/desktop/overview"},
                            {text: "开发规范", link: "/standards/code-style"},
                            {text: "工具教程", link: "/tutorial/podman-source"},
                            {text: "共享包", link: "/packages/utils"},
                            {text: "更新日志", link: "/changelog/backend-CHANGELOG"},
                        ],
                    },
                ],
                sidebar: {
                    "/guide/": [
                        {
                            text: "快速开始",
                            items: [
                                {text: "项目介绍", link: "/guide/introduction"},
                                {text: "快速开始", link: "/guide/quickstart"},
                                {text: "目录结构", link: "/guide/directory"},
                            ],
                        },
                    ],
                    "/architecture/": [
                        {
                            text: "架构与设计",
                            items: [
                                {text: "整体架构", link: "/architecture/overview"},
                                {text: "前后端通信", link: "/architecture/api"},
                                {text: "认证与权限", link: "/architecture/auth"},
                                {text: "实时通信", link: "/architecture/websocket"},
                            ],
                        },
                    ],
                    "/frontend/": [
                        {
                            text: "前端开发",
                            items: [
                                {text: "技术栈概览", link: "/frontend/tech-stack"},
                                {text: "路由与菜单", link: "/frontend/routing"},
                                {text: "状态管理", link: "/frontend/state"},
                                {text: "请求服务", link: "/frontend/api-service"},
                                {text: "国际化", link: "/frontend/i18n"},
                                {text: "UI 组件与主题", link: "/frontend/ui"},
                                {text: "构建与 Vite 插件", link: "/frontend/build"},
                            ],
                        },
                    ],
                    "/backend/": [
                        {
                            text: "后端开发",
                            items: [
                                {text: "技术栈概览", link: "/backend/tech-stack"},
                                {text: "快速开始", link: "/backend/quickstart"},
                                {text: "架构概览", link: "/backend/architecture"},
                                {text: "插件系统", link: "/backend/plugin-system"},
                                {text: "插件开发", link: "/backend/plugin-development"},
                                {text: "数据库与 ORM", link: "/backend/database"},
                                {text: "中间件", link: "/backend/middleware"},
                                {text: "错误处理与状态码", link: "/backend/error-handling"},
                                {text: "国际化", link: "/backend/i18n"},
                                {text: "日志系统", link: "/backend/logging"},
                                {text: "Pydantic 模型规范", link: "/backend/pydantic"},
                                {text: "定时任务调度", link: "/backend/schedule"},
                                {text: "Celery 任务队列", link: "/backend/celery"},
                                {text: "工具链", link: "/backend/toolchain"},
                            ],
                        },
                    ],
                    "/desktop/": [
                        {
                            text: "桌面端",
                            items: [{text: "概述", link: "/desktop/overview"}],
                        },
                    ],
                    "/deploy/": [
                        {
                            text: "部署运维",
                            items: [
                                {text: "Docker 容器化", link: "/deploy/docker"},
                                {text: "dock CLI 工具", link: "/deploy/dock-cli"},
                                {text: "Nginx / Caddy 配置", link: "/deploy/proxy"},
                            ],
                        },
                    ],
                    "/standards/": [
                        {
                            text: "开发规范",
                            items: [
                                {text: "代码风格", link: "/standards/code-style"},
                                {text: "Git 提交规范", link: "/standards/git"},
                                {text: "静态检查", link: "/standards/static-check"},
                                {text: "测试", link: "/standards/testing"},
                            ],
                        },
                    ],
                    "/tutorial/": [
                        {
                            text: "工具教程",
                            items: [
                                {text: "Podman 使用指南", link: "/tutorial/podman-source"},
                                {text: "uv 包管理器", link: "/tutorial/uv"},
                                {text: "pnpm 工作区", link: "/tutorial/pnpm"},
                                {text: "VS Code 配置", link: "/tutorial/vscode-extensions"},
                            ],
                        },
                    ],
                    "/packages/": [
                        {
                            text: "共享包参考",
                            items: [
                                {text: "@rapidkit/utils", link: "/packages/utils"},
                                {text: "@rapidkit/hooks", link: "/packages/hooks"},
                                {text: "@rapidkit/axios", link: "/packages/axios"},
                                {text: "@rapidkit/editor", link: "/packages/editor"},
                                {text: "@rapidkit/color", link: "/packages/color"},
                            ],
                        },
                    ],
                    "/changelog/": [
                        {
                            text: "Apps",
                            items: [
                                {text: "Backend", link: "/changelog/backend-CHANGELOG"},
                                {text: "Frontend", link: "/changelog/frontend-CHANGELOG"},
                                {text: "Desktop", link: "/changelog/desktop-CHANGELOG"},
                                {text: "Website", link: "/changelog/website-CHANGELOG"},
                            ],
                        },
                        {
                            text: "Packages",
                            items: [
                                {text: "Axios", link: "/changelog/axios-CHANGELOG"},
                                {text: "Alova", link: "/changelog/alova-CHANGELOG"},
                                {text: "Builder", link: "/changelog/builder-CHANGELOG"},
                                {text: "Color", link: "/changelog/color-CHANGELOG"},
                                {text: "Utils", link: "/changelog/utils-CHANGELOG"},
                                {text: "Hooks", link: "/changelog/hooks-CHANGELOG"},
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
                nav: [{text: "Home", link: "/en/"}],
                sidebar: {},
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
        socialLinks: [{icon: "github", link: "https://github.com/GJCoke/rapidkit"}],
    },
    markdown: {
        config(md) {
            md.use(tabsMarkdownPlugin)
        },
    },
})

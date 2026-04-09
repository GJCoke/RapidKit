# 技术栈概览

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin)
开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## 核心技术栈

| 技术       | 版本 | 说明                                         |
| ---------- | ---- | -------------------------------------------- |
| Vue        | 3.5  | 渐进式 JavaScript 框架，使用 Composition API |
| Vite       | 8    | 下一代前端构建工具                           |
| TypeScript | 6    | JavaScript 超集，提供静态类型检查            |
| Naive UI   | 2.44 | Vue 3 组件库，支持 Tree Shaking              |
| UnoCSS     | 66   | 原子化 CSS 引擎                              |
| Pinia      | 3    | Vue 官方状态管理，支持 Setup Store 语法      |
| Vue Router | 5    | Vue 官方路由管理                             |
| Vue I18n   | 11   | 国际化方案，Composition API 模式             |
| ECharts    | 6    | 数据可视化图表库                             |
| VueUse     | 14   | Composition API 工具集                       |

## Soybean Admin 说明

[Soybean Admin](https://github.com/soybeanjs/soybean-admin) 是一套清新优雅的中后台模板，提供了完整的前端工程化方案。本项目在其基础上进行了以下方面的定制：

- **I18n 类型自动生成** -- 在 `locales/langs` 下配置语言文件后，Vite 插件自动生成 TypeScript 类型定义
- **Service 类型自动推导** -- 通过 `openapi-typescript` 从后端 OpenAPI Schema 自动生成接口类型
- **Workspace 包依赖** -- 前端应用依赖多个 Monorepo 内部包，实现代码复用

## Workspace 包依赖关系

前端应用 `@rapidkit/frontend` 依赖以下 Monorepo 内部包：

```
@rapidkit/frontend
  ├── @rapidkit/axios    → HTTP 请求封装（依赖 @rapidkit/utils）
  ├── @rapidkit/hooks    → 通用 Composition Hooks（依赖 @rapidkit/axios）
  ├── @rapidkit/color    → 主题色彩工具（依赖 @rapidkit/utils）
  ├── @rapidkit/utils    → 基础工具函数
  └── @rapidkit/editor   → Monaco Code Editor 组件（独立包）
```

::: tip
内部包通过 `workspace:*` 协议引用，Turborepo 会自动处理构建顺序和缓存。
:::

## 主要 Vite 插件

| 插件                                 | 说明                                       |
| ------------------------------------ | ------------------------------------------ |
| `@vitejs/plugin-vue`                 | Vue 3 SFC 编译                             |
| `@vitejs/plugin-vue-jsx`             | Vue JSX/TSX 支持                           |
| `@elegant-router/vue`                | 基于文件系统的路由自动生成                 |
| `@unocss/vite`                       | UnoCSS 原子化 CSS 集成                     |
| `unplugin-vue-components`            | Vue 组件自动导入（含 Naive UI Resolver）   |
| `unplugin-icons`                     | 图标按需加载，支持 Iconify 和本地 SVG      |
| `vite-plugin-svg-icons`              | SVG 雪碧图生成                             |
| `vite-plugin-vue-devtools`           | Vue DevTools 集成                          |
| `vite-plugin-progress`               | 构建进度条显示                             |
| `vite-plugin-generate-i18n-types`    | 自定义插件，自动生成 I18n 类型定义         |
| `vite-plugin-generate-openapi-types` | 自定义插件，从 OpenAPI Schema 生成接口类型 |

## I18n 升级

当前项目对多语言的处理方式进行了优化：

- 只需在 `apps/frontend/src/locales/langs` 下配置对应语言及 namespace 文件
- 程序会自动生成对应的 TypeScript 类型文件（`src/typings/i18n.d.ts`）
- 开发过程中可以获得完整类型提示，减少人为错误

## Service 升级

使用 `openapi-typescript` 自动生成接口 Schema 类型文件，实现以下目标：

- 避免重复定义类型
- 请求参数和返回值类型自动推导
- 提升开发效率和类型安全

### 类型使用示例

以接口 `/api/v1/auth/login` 为例，获取请求参数类型：

```ts
// Body 参数
Service.ApiRequest<"/api/v1/auth/login", "post", "body">

// Query 参数
Service.ApiRequest<"/api/v1/auth/login", "post", "query">

// Path 参数
Service.ApiRequest<"/api/v1/auth/login", "post", "path">
```

获取接口响应类型：

```ts
Service.ApiResponse<"/api/v1/auth/login", "post">
```

### 全局 API 类型声明

在 `src/typings/` 下创建全局类型声明文件，方便在业务代码中直接使用：

```ts
import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    namespace Auth {
      type LoginBody = Service.ApiRequest<"/api/v1/auth/login", "post", "body">
      type LoginToken = Service.ApiResponse<"/api/v1/auth/login", "post">
      type UserInfo = Service.ApiResponse<"/api/v1/auth/user/info">
    }
  }
}
```

::: info 提示
你也可以在 request 封装中增加更智能的类型推导，但通常我们希望类型定义不仅在接口调用时使用，因此当前实现更灵活可扩展。
:::

## 其他关键依赖

| 依赖                 | 说明                                          |
| -------------------- | --------------------------------------------- |
| Web Crypto API       | RSA-OAEP (SHA-256) 加密，用于登录密码加密传输 |
| `nprogress`          | 页面加载进度条                                |
| `dayjs`              | 轻量日期处理库                                |
| `socket.io-client`   | WebSocket 客户端，用于实时数据推送            |
| `simplebar-vue`      | 自定义滚动条组件                              |
| `vue-draggable-plus` | 拖拽排序组件                                  |
| `clipboard`          | 剪贴板操作                                    |
| `tailwind-merge`     | Tailwind CSS 类名合并工具                     |

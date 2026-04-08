# 构建与 Vite 插件

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin) 开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## Vite 配置概览

Vite 配置文件位于 `apps/frontend/vite.config.ts`，主要配置包括路径别名、SCSS 全局注入、插件加载、代理和构建选项。

### 路径别名

| 别名 | 指向                 | 说明       |
| ---- | -------------------- | ---------- |
| `~`  | `apps/frontend/`     | 项目根目录 |
| `@`  | `apps/frontend/src/` | 源码目录   |

### SCSS 全局注入

```ts
css: {
  preprocessorOptions: {
    scss: {
      api: "modern-compiler",
      additionalData: `@use "@/styles/scss/global.scss" as *;`
    }
  }
}
```

全局 SCSS 文件中的变量和 mixin 在所有组件中可直接使用，无需单独导入。

## 环境变量

项目使用三层环境变量文件：

| 文件        | 说明                   |
| ----------- | ---------------------- |
| `.env`      | 基础配置，所有环境共享 |
| `.env.test` | 测试环境覆盖配置       |
| `.env.prod` | 生产环境覆盖配置       |

### 关键环境变量

| 变量                               | 默认值           | 说明                                    |
| ---------------------------------- | ---------------- | --------------------------------------- |
| `VITE_BASE_URL`                    | `/`              | 应用基础路径                            |
| `VITE_APP_TITLE`                   | `SoybeanAdmin`   | 应用标题                                |
| `VITE_AUTH_ROUTE_MODE`             | `dynamic`        | 权限路由模式（static / dynamic）        |
| `VITE_ROUTE_HOME`                  | `home`           | 默认首页路由名                          |
| `VITE_HTTP_PROXY`                  | `Y`              | 开发环境是否启用 HTTP 代理              |
| `VITE_ROUTER_HISTORY_MODE`         | `history`        | 路由历史模式（history / hash / memory） |
| `VITE_SERVICE_BASE_URL`            | --               | 后端 API 基础地址                       |
| `VITE_SERVICE_OPENAPI_URL`         | --               | OpenAPI Schema 地址                     |
| `VITE_SERVICE_SUCCESS_CODE`        | `0`              | 后端成功响应码                          |
| `VITE_SERVICE_LOGOUT_CODES`        | `401`            | 登出响应码                              |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | Token 过期响应码                        |
| `VITE_SOURCE_MAP`                  | `N`              | 是否生成 Source Map                     |
| `VITE_STORAGE_PREFIX`              | `SOY_`           | localStorage 前缀                       |
| `VITE_ICON_PREFIX`                 | `icon`           | 图标组件前缀                            |
| `VITE_ICON_LOCAL_PREFIX`           | `icon-local`     | 本地 SVG 图标前缀                       |
| `VITE_STATIC_SUPER_ROLE`           | `R_SUPER`        | 静态路由超级角色标识                    |

### 环境差异

| 变量                    | `.env.test`                     | `.env.prod` |
| ----------------------- | ------------------------------- | ----------- |
| `VITE_SERVICE_BASE_URL` | `http://localhost:16000/api/v1` | `/api/v1`   |
| `VITE_SOURCE_MAP`       | `Y`                             | `N`（默认） |

::: tip
生产环境的 `VITE_SERVICE_BASE_URL` 设置为相对路径 `/api/v1`，由 Nginx 反向代理转发到后端服务。
:::

## 开发代理

当 `VITE_HTTP_PROXY=Y` 且处于开发模式时，Vite 自动创建代理规则：

```ts
// builder/config/proxy.ts
// 将前端请求代理到 VITE_SERVICE_BASE_URL
// 例如 /api/v1/* → http://localhost:16000/api/v1/*
```

代理日志输出由 `VITE_PROXY_LOG` 控制。

## Vite 插件详解

所有插件在 `apps/frontend/builder/plugins/` 目录下配置：

### 核心插件

| 插件                     | 文件 | 说明               |
| ------------------------ | ---- | ------------------ |
| `@vitejs/plugin-vue`     | --   | Vue 3 SFC 编译支持 |
| `@vitejs/plugin-vue-jsx` | --   | JSX/TSX 语法支持   |
| `vite-plugin-progress`   | --   | 构建时显示进度条   |

### 路由插件

| 插件                  | 文件        | 说明                                                           |
| --------------------- | ----------- | -------------------------------------------------------------- |
| `@elegant-router/vue` | `router.ts` | 基于文件系统的路由自动生成，配置了布局映射和路由元信息生成规则 |

布局映射：

```ts
layouts: {
  base: "src/layouts/base-layout/index.vue",
  blank: "src/layouts/blank-layout/index.vue",
}
```

### UnoCSS 插件

| 插件           | 文件        | 说明                                                    |
| -------------- | ----------- | ------------------------------------------------------- |
| `@unocss/vite` | `unocss.ts` | 原子化 CSS，配置了 `preset-icons` 支持本地 SVG 图标集合 |

### 自动导入插件

| 插件                      | 文件          | 说明                                  |
| ------------------------- | ------------- | ------------------------------------- |
| `unplugin-vue-components` | `unplugin.ts` | Vue 组件自动导入（Naive UI + Icons）  |
| `unplugin-icons`          | `unplugin.ts` | 图标按需加载，支持 Iconify 和本地 SVG |
| `vite-plugin-svg-icons`   | `unplugin.ts` | SVG 雪碧图生成                        |

### 类型生成插件

| 插件                     | 文件         | 说明                                                 |
| ------------------------ | ------------ | ---------------------------------------------------- |
| `generate-i18n-types`    | `i18n.ts`    | 监听 locale JSON 文件变化，自动生成 `i18n.d.ts` 类型 |
| `generate-openapi-types` | `openapi.ts` | 从 OpenAPI Schema 生成 `schema.d.ts` 接口类型        |

### 开发辅助插件

| 插件                       | 文件          | 说明                                            |
| -------------------------- | ------------- | ----------------------------------------------- |
| `vite-plugin-vue-devtools` | `devtools.ts` | Vue DevTools 浏览器集成，支持配置编辑器打开方式 |
| `html-plugin`              | `html.ts`     | 构建时向 HTML 注入 `buildTime` meta 标签        |

## Turborepo 集成

前端构建通过 Turborepo 管理，确保依赖包按正确顺序构建：

```bash
# 在 monorepo 根目录执行
pnpm turbo run build --filter=@monorepo-example/frontend
```

Turborepo 会自动识别 `@monorepo-example/axios`、`@monorepo-example/hooks` 等 workspace 依赖，先构建这些包再构建前端应用。

## 构建命令

| 命令             | 说明                                        |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | 启动开发服务器（默认 test 模式，端口 9527） |
| `pnpm build`     | 构建生产版本（默认 test 模式）              |
| `pnpm preview`   | 预览构建结果（端口 9725）                   |
| `pnpm typecheck` | TypeScript 类型检查（vue-tsc）              |
| `pnpm format`    | Prettier 格式化                             |
| `pnpm lint`      | ESLint 检查并修复                           |

::: warning
默认 `pnpm build` 使用 `--mode test`。如需构建生产版本，请使用 `vite build --mode prod` 加载 `.env.prod` 配置。
:::

# 路由与菜单

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin) 开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## 路由模式

项目支持两种权限路由模式，通过环境变量 `VITE_AUTH_ROUTE_MODE` 控制：

| 模式     | 值        | 说明                                |
| -------- | --------- | ----------------------------------- |
| 静态模式 | `static`  | 路由在前端定义，根据用户角色过滤    |
| 动态模式 | `dynamic` | 路由从后端 API 获取，按用户权限返回 |

默认使用 `dynamic` 模式。建议开发环境使用 `static` 模式方便调试，生产环境使用 `dynamic` 模式。

## Elegant Router

项目使用 [@elegant-router/vue](https://github.com/soybeanjs/elegant-router) 实现基于文件系统的路由自动生成。

### 工作原理

Elegant Router 扫描 `src/views/` 目录下的页面文件，自动生成以下文件到 `src/router/elegant/`：

| 自动生成文件   | 说明                                                  |
| -------------- | ----------------------------------------------------- |
| `imports.ts`   | 页面组件懒加载导入映射（layouts 和 views）            |
| `routes.ts`    | 路由配置数组 `generatedRoutes`                        |
| `transform.ts` | 路由转换工具函数，将 Elegant 路由转为 Vue Router 格式 |

### 路由命名规则

文件路径自动映射为路由名称：

```
src/views/queue/dashboard/index.vue    →  路由名: queue_dashboard
src/views/queue/task/index.vue         →  路由名: queue_task
src/views/system-manage/role/index.vue →  路由名: system-manage_role
```

### 路由元信息

Elegant Router 的 `onRouteMetaGen` 钩子为每个路由生成默认的 meta 信息：

```ts
{
  title: routeName,
  i18nKey: `route.${routeName}`,  // 国际化 key
  constant: true                   // 仅 login、403、404、500
}
```

## 静态路由模式

在静态模式下，`createStaticRoutes()` 将所有生成的路由分为两类：

- **constantRoutes** -- 不需要登录即可访问的路由（`meta.constant === true`），如登录页、错误页
- **authRoutes** -- 需要登录才能访问的路由

权限过滤逻辑：

1. 如果用户拥有超级角色（`VITE_STATIC_SUPER_ROLE`，默认 `R_SUPER`），则可访问全部 authRoutes
2. 否则，根据用户角色与路由 `meta.roles` 进行匹配过滤

## 动态路由模式

在动态模式下，路由从后端获取：

1. 调用 `fetchGetConstantRoutes()` 获取后端常量路由，与前端静态常量路由合并
2. 调用 `fetchGetUserRoutes()` 获取当前用户的权限路由
3. 后端返回的路由数据包含 `routes` 和 `home`（首页路由 key）
4. 将路由通过 `transformElegantRoutesToVueRoutes()` 转换后动态注册到 Vue Router

::: warning
后端返回的路由结构必须符合 `ElegantConstRoute` 类型定义，包含 `name`、`path`、`component`、`meta` 等字段。
:::

## 菜单生成

菜单从路由配置自动生成，流程如下：

1. `handleConstantAndAuthRoutes()` 合并常量路由和权限路由
2. `sortRoutesByOrder()` 按 `meta.order` 排序
3. `getGlobalMenusByAuthRoutes()` 从排序后的路由生成菜单树
4. 切换语言时，`updateGlobalMenusByLocale()` 更新菜单的国际化文本

菜单项的图标、标题、排序等信息均来自路由的 `meta` 字段。

## 路由守卫

路由守卫由三个独立的 Guard 组成，按顺序执行：

### 1. Progress Guard

```ts
// beforeEach: 启动 NProgress 进度条
// afterEach: 完成 NProgress 进度条
```

### 2. Route Guard（核心鉴权逻辑）

主要执行流程：

```
路由跳转
  ├── 常量路由未初始化？ → 初始化常量路由 → 重定向
  ├── 未登录？
  │     ├── 访问常量路由？ → 放行
  │     └── 访问权限路由？ → 跳转登录页（携带 redirect 参数）
  └── 已登录？
        ├── 权限路由未初始化？ → 初始化权限路由 → 重定向
        ├── 访问登录页？ → 跳转首页
        ├── 无权限？ → 跳转 403 页面
        └── 正常跳转
```

### 3. Document Title Guard

```ts
// afterEach: 根据路由 meta.i18nKey 或 meta.title 更新页面标题
```

## 权限控制

项目支持两个层级的权限控制：

### 路由级权限

通过路由 `meta.roles` 定义哪些角色可以访问该路由。在静态模式下由前端过滤，在动态模式下由后端直接返回用户可访问的路由。

### 按钮级权限

用户信息中包含 `buttons` 字段，是一个权限标识数组。在页面中可以根据该字段控制按钮的显示/隐藏：

```ts
const authStore = useAuthStore()
const hasPermission = authStore.userInfo.buttons.includes("sys:user:add")
```

## 路由历史模式

通过环境变量 `VITE_ROUTER_HISTORY_MODE` 控制，支持三种模式：

| 模式      | 说明                      |
| --------- | ------------------------- |
| `history` | HTML5 History API（默认） |
| `hash`    | URL Hash 模式             |
| `memory`  | 内存模式（SSR 场景）      |

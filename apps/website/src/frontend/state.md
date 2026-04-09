# 状态管理

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin)
开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## 概述

项目使用 Pinia 3 进行状态管理，全部采用 Setup Store（Composition API）语法定义。Store 文件位于 `src/store/modules/`
目录下，每个模块一个独立文件夹。

## Store 模块总览

| 模块  | 文件路径               | 说明                                           |
| ----- | ---------------------- | ---------------------------------------------- |
| auth  | `store/modules/auth/`  | 用户认证、登录登出、用户信息、Token 管理       |
| route | `store/modules/route/` | 路由管理、菜单生成、路由缓存、面包屑           |
| theme | `store/modules/theme/` | 主题配置、暗色模式、色彩系统、水印             |
| app   | `store/modules/app/`   | 应用全局状态、语言切换、侧边栏折叠、响应式布局 |
| tab   | `store/modules/tab/`   | 标签页管理、缓存、拖拽排序                     |

## Auth Store

Auth Store 是最核心的状态模块，管理用户的认证生命周期。

### 登录流程

完整的登录流程如下：

```
用户输入用户名/密码
  │
  ├── 1. fetchGetPublicKey() → 获取 RSA 公钥
  │
  ├── 2. Web Crypto API RSA-OAEP (SHA-256) 加密密码
  │
  ├── 3. fetchLogin({ username, password }) → 调用登录 API
  │
  ├── 4. loginByToken(loginToken)
  │     ├── 存储 accessToken 到 localStorage
  │     ├── 存储 refreshToken 到 localStorage
  │     └── getUserInfo() → 获取用户信息
  │
  ├── 5. checkTabClear() → 检查是否需要清空标签页（用户切换场景）
  │
  ├── 6. redirectFromLogin() → 跳转目标页面
  │
  └── 7. 显示登录成功通知
```

### 用户信息结构

```ts
interface UserInfo {
  id: string
  createTime: string
  updateTime: string
  name: string
  email: string
  username: string
  isAdmin: boolean
  roles: string[] // 角色标识列表
  buttons: string[] // 按钮权限标识列表
}
```

### 关键状态和方法

| 属性/方法        | 类型       | 说明                                  |
| ---------------- | ---------- | ------------------------------------- |
| `token`          | `ref`      | 当前 Access Token                     |
| `userInfo`       | `reactive` | 当前用户信息                          |
| `isLogin`        | `computed` | 是否已登录                            |
| `isStaticSuper`  | `computed` | 是否为静态路由超级角色                |
| `login()`        | 方法       | 执行登录流程                          |
| `resetStore()`   | 方法       | 重置认证状态并跳转登录页              |
| `initUserInfo()` | 方法       | 从 Token 初始化用户信息（页面刷新时） |

## Token 管理

项目采用双 Token 机制：

| Token         | 存储 Key       | 说明                              |
| ------------- | -------------- | --------------------------------- |
| Access Token  | `token`        | 请求时携带，有效期较短            |
| Refresh Token | `refreshToken` | 用于刷新 Access Token，有效期较长 |

### 自动刷新机制

当后端返回的响应码匹配 `VITE_SERVICE_EXPIRED_TOKEN_CODES`（如 `9999,9998,3333`）时，请求拦截器会自动执行 Token 刷新：

1. 使用 Refresh Token 调用刷新接口
2. 获取新的 Access Token
3. 更新 localStorage 中的 Token
4. 使用新 Token 重新发送失败的请求

::: tip
Token 刷新逻辑使用 Promise 缓存机制，确保并发请求时只触发一次刷新操作。
:::

## Route Store

Route Store 管理路由的初始化和动态注册。

### 主要职责

- 根据路由模式（static/dynamic）初始化权限路由
- 将 Elegant Router 格式转换为 Vue Router 格式并动态注册
- 生成全局菜单（`menus`）和搜索菜单（`searchMenus`）
- 管理路由缓存（`cacheRoutes`）
- 计算面包屑（`breadcrumbs`）

### 路由初始化流程

```
页面加载
  │
  ├── initConstantRoute()
  │     ├── 加载静态常量路由（login、404 等）
  │     ├── dynamic 模式下从后端获取额外常量路由
  │     └── 注册到 Vue Router
  │
  └── initAuthRoute()（登录后触发）
        ├── static 模式：从前端路由配置按角色过滤
        ├── dynamic 模式：调用 fetchGetUserRoutes() 获取
        ├── 转换并注册到 Vue Router
        └── 生成菜单和缓存
```

## Theme Store

Theme Store 管理主题相关的所有配置。

### 主题模式

通过 `themeScheme` 控制，支持三种模式：

| 模式 | 值      | 说明                                                |
| ---- | ------- | --------------------------------------------------- |
| 浅色 | `light` | 浅色主题                                            |
| 深色 | `dark`  | 深色主题                                            |
| 自动 | `auto`  | 跟随系统偏好（通过 `usePreferredColorScheme` 检测） |

### 主题色系统

支持自定义以下主题色：

- **primary** -- 主色调（`themeColor`）
- **info / success / warning / error** -- 辅助色（`otherColor`）
- `isInfoFollowPrimary` -- info 色是否跟随主色

颜色变更时，通过 `@rapidkit/color` 包的 `getPaletteColorByNumber` 生成推荐色板。

### 其他功能

- 水印（Watermark）：支持用户名水印和时间水印
- 灰度模式（Grayscale）
- 色弱模式（Colour Weakness）
- 布局模式切换
- 主题设置在页面关闭时自动缓存到 localStorage

## App Store

App Store 管理应用的全局状态。

### 主要功能

| 功能       | 说明                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 语言切换   | `locale` / `changeLocale()`，切换时联动更新标题、菜单、标签页、dayjs |
| 响应式布局 | `isMobile`，基于 Tailwind 断点，移动端自动切换为 vertical 布局       |
| 侧边栏     | `siderCollapse` / `toggleSiderCollapse()`，支持折叠和展开            |
| 页面刷新   | `reloadPage()`，通过重置 `reloadFlag` 实现无刷新重载                 |
| 全屏内容   | `fullContent` / `toggleFullContent()`，隐藏侧边栏和头部              |
| 主题抽屉   | `themeDrawerVisible` / `openThemeDrawer()`，打开主题设置面板         |

## Tab Store

Tab Store 管理多标签页。

### 主要功能

- 添加/移除/切换标签页
- 左侧/右侧/其他标签页批量关闭
- 固定标签页不可关闭
- 标签页缓存到 localStorage（由 Theme Store 的 `tab.cache` 控制）
- 用户切换时自动清空标签页
- 自定义标签页标题（`setTabLabel` / `resetTabLabel`）
- 语言切换时更新标签页标题

## RBAC 权限集成

Auth Store 和 Route Store 协同实现 RBAC 权限控制：

```
用户登录 → authStore 存储 roles 和 buttons
                │
                ├── routeStore 根据 roles 过滤/获取路由
                │     └── 生成权限菜单
                │
                └── 页面中根据 buttons 控制按钮权限
```

::: tip
静态模式下，超级角色（`R_SUPER`）可以访问所有路由，无需配置 `meta.roles`。动态模式下，权限完全由后端控制。
:::

# 桌面端概述

本项目通过 `apps/desktop` 提供基于 Electron 的桌面客户端，复用前端 Vue 3 应用，以最小的额外代码实现跨平台桌面分发。

## 技术架构

桌面端采用 **Electron 41** 作为运行时容器，结合 **Vite 8** 和 `vite-plugin-electron` 实现开发阶段的热更新与生产构建。核心依赖如下:

| 依赖                          | 版本   | 用途                          |
| ----------------------------- | ------ | ----------------------------- |
| electron                      | 41.1.1 | 桌面运行时                    |
| vite-plugin-electron          | 0.29.1 | Vite 集成 Electron 主进程构建 |
| vite-plugin-electron-renderer | 0.14.6 | 渲染进程 Node.js 集成         |
| electron-builder              | 26.x   | 应用打包与分发                |
| electron-log                  | 5.x    | 日志记录                      |

## 主进程

入口文件 `src/index.ts` 实例化 `AppMain` 类，该类封装了窗口管理与应用生命周期:

```ts
// src/core/main.ts
export class AppMain {
  private mainWindow: BrowserWindow | null = null

  constructor() {
    this.registerEvents()
  }
}
```

`AppMain` 注册了三个核心事件:

- **`ready`** -- 创建主窗口，尺寸为 900x600，加载前端页面
- **`window-all-closed`** -- 非 macOS 平台下退出应用
- **`activate`** -- macOS 下点击 Dock 图标时恢复窗口

::: tip 前端加载方式
主窗口通过 `loadURL("http://localhost:9527")` 加载前端开发服务器。生产环境下需改为加载本地构建产物。
:::

## Preload 脚本

Preload 脚本通过 `contextBridge.exposeInMainWorld` 向渲染进程安全地暴露 IPC 通信接口，挂载在 `window.electron` 上:

| 方法     | 签名                                 | 说明                             |
| -------- | ------------------------------------ | -------------------------------- |
| `send`   | `(channel, ...args) => void`         | 单向发送消息到主进程             |
| `on`     | `(channel, listener) => unsubscribe` | 监听主进程消息，返回取消订阅函数 |
| `once`   | `(channel, listener) => void`        | 一次性监听主进程消息             |
| `invoke` | `(channel, ...args) => Promise`      | 双向调用，等待主进程返回结果     |

::: warning 安全性
Preload 脚本没有对 channel 名称做白名单过滤。在正式发布前，建议限制可用的 channel 范围，防止渲染进程调用任意 IPC 通道。
:::

## 代码共享

桌面端的核心策略是 **零 UI 代码重复** -- 渲染进程直接加载 `apps/frontend` 提供的 Vue 3 SPA。两端共享同一套路由、状态管理和业务组件，桌面端仅额外提供:

- Electron 主进程 (窗口管理、系统集成)
- Preload 脚本 (IPC 桥接)

这意味着前端的任何功能更新会自动反映到桌面端，无需额外适配。

## 构建与打包

项目使用 `electron-builder` 进行应用打包，支持生成 macOS (.dmg)、Windows (.exe/.msi) 和 Linux (.AppImage/.deb) 安装包。

```bash
# 开发模式 (在 monorepo 根目录)
pnpm dev:desktop

# 类型检查
pnpm --filter @monorepo-example/desktop typecheck
```

::: info 构建流程

1. Vite 构建前端静态资源
2. `vite-plugin-electron` 编译主进程和 preload 脚本
3. `electron-builder` 将所有产物打包为平台安装包
   :::

## 当前状态

桌面端当前版本为 **v0.1.1**，处于脚手架阶段:

- 基本窗口管理已实现
- IPC 通信桥接已就绪
- 尚未实现原生菜单、托盘图标、自动更新等桌面特性
- 生产构建流程尚需配置 (当前 `loadURL` 指向开发服务器)

::: details 目录结构

```
apps/desktop/
├── src/
│   ├── index.ts          # 入口，实例化 AppMain
│   ├── core/
│   │   └── main.ts       # 主进程: 窗口创建与生命周期
│   └── preload/
│       └── index.ts      # Preload: contextBridge IPC 暴露
├── package.json
└── tsconfig.json
```

:::

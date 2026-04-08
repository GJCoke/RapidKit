# 目录结构

## 整体布局

项目采用 Monorepo 单仓库架构，按「应用层、共享层、配置层、辅助层」四层组织代码：

```
monorepo-example/
├── apps/                    # 应用层：可独立运行的应用
│   ├── frontend/            # Vue 3 前端应用
│   ├── backend/             # FastAPI 后端服务
│   └── desktop/             # Electron 桌面客户端
├── packages/                # 共享层：多应用复用的功能模块
│   ├── utils/               # 通用工具函数库
│   ├── axios/               # Axios HTTP 请求封装
│   ├── alova/               # Alova 请求策略库
│   ├── hooks/               # Vue Composition Hooks
│   ├── color/               # 颜色工具与主题管理
│   ├── editor/              # Monaco Editor 代码编辑器组件
│   └── builder/             # 构建辅助工具 (Rollup 配置)
├── docs/                    # 辅助层：文档系统
│   └── website/             # VitePress 文档站点
├── scripts/                 # 辅助层：运维与自动化脚本
├── docker/                  # Docker 构建文件
├── turbo.json               # Turborepo 任务编排配置
├── pnpm-workspace.yaml      # pnpm Workspaces 配置
├── pyproject.toml           # Python 项目配置 (uv)
├── package.json             # 根 package.json (全局依赖与脚本)
├── tsconfig.json            # TypeScript 全局编译配置
├── eslint.config.ts         # ESLint 代码检查配置
├── prettier.config.ts       # Prettier 格式化配置
├── commitlint.config.ts     # Git 提交规范配置
├── cspell.json              # 拼写检查配置
├── docker-compose.dev.yaml  # Docker Compose 开发环境编排
└── Caddyfile                # Caddy 反向代理配置
```

## 应用目录 (apps/)

每个子目录都是独立的可执行应用，拥有自己的依赖、入口和构建配置，可单独启动与部署。

| 目录        | 说明                                                         | 技术栈                             |
| ----------- | ------------------------------------------------------------ | ---------------------------------- |
| `frontend/` | Web 前端单页应用，包含路由、状态管理、国际化等完整功能       | Vue 3, Vite, Naive UI, TypeScript  |
| `backend/`  | RESTful API 后端服务，提供权限、数据处理、任务队列等核心功能 | FastAPI, PostgreSQL, Redis, Celery |
| `desktop/`  | 跨平台桌面客户端，复用前端代码并扩展系统级能力               | Electron, Vue 3                    |

::: info 提示
各应用的详细目录结构请参阅对应的开发文档：[前端开发](/frontend/)、[后端开发](/backend/)。
:::

## 共享包目录 (packages/)

面向应用层提供通用能力，通过 pnpm Workspaces 作为内部依赖被各应用引用。

| 包名       | npm 包名                    | 说明                                                    |
| ---------- | --------------------------- | ------------------------------------------------------- |
| `utils/`   | `@monorepo-example/utils`   | 通用工具函数，覆盖字符串、数组、时间、类型判断等场景    |
| `axios/`   | `@monorepo-example/axios`   | 基于 Axios 的请求封装，内置拦截器、超时处理、Token 注入 |
| `alova/`   | `@monorepo-example/alova`   | 基于 Alova 的请求策略库                                 |
| `hooks/`   | `@monorepo-example/hooks`   | Vue 3 Composition Hooks，封装可复用的组合式逻辑         |
| `color/`   | `@monorepo-example/color`   | 颜色工具与主题色管理                                    |
| `editor/`  | `@monorepo-example/editor`  | Monaco Editor Vue 组件，提供代码编辑与输出面板          |
| `builder/` | `@monorepo-example/builder` | 构建辅助工具，封装 Rollup 配置片段与 CI 脚本            |

## 根目录配置文件

| 文件                      | 用途                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `turbo.json`              | Turborepo 任务依赖关系、并行策略与缓存配置                         |
| `pnpm-workspace.yaml`     | 定义 Monorepo 工作区范围 (`apps/*`, `packages/*`, `docs/*`)        |
| `pyproject.toml`          | Python 项目元信息与 uv 依赖管理                                    |
| `package.json`            | 全局 devDependencies 与根级脚本 (如 `dev:frontend`, `dev:backend`) |
| `tsconfig.json`           | TypeScript 全局编译选项与路径别名                                  |
| `eslint.config.ts`        | ESLint 静态分析规则，统一前端代码风格                              |
| `prettier.config.ts`      | Prettier 代码格式化规则                                            |
| `commitlint.config.ts`    | Conventional Commits 提交信息校验规则                              |
| `cspell.json`             | 拼写检查词库与规则配置                                             |
| `docker-compose.dev.yaml` | 开发环境 Docker 服务编排 (PostgreSQL, Redis 等)                    |

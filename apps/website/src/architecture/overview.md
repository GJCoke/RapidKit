# 整体架构

## Monorepo 仓库结构

项目采用 Monorepo 模式，通过 pnpm workspace 管理 JavaScript/TypeScript 生态，通过 uv 管理 Python 生态，由 Turborepo
统一编排构建任务。整体目录结构如下：

```
rapidkit/
├── apps/                          # 应用层
│   ├── frontend/                  # Vue 3 前端应用 (Soybean Admin)
│   ├── backend/                   # FastAPI 后端服务 (Python)
│   │   ├── src/                   #   应用入口、中间件、Socket.IO
│   │   ├── plugins/               #   业务插件（独立 uv workspace 包）
│   │   └── alembic/               #   数据库迁移（多分支）
│   └── desktop/                   # Electron 桌面客户端
├── packages/                      # 共享包层
│   ├── core/                      # rapidkit-core（后端基础设施）
│   ├── common/                    # rapidkit-common（后端公共层）
│   ├── cli/                       # RapidKit CLI（rapidkit 命令行工具）
│   ├── utils/                     # 通用工具函数
│   ├── axios/                     # HTTP 请求封装
│   ├── hooks/                     # Vue Composition API Hooks
│   ├── color/                     # 颜色管理工具
│   ├── editor/                    # Monaco Code Editor 组件
│   ├── builder/                   # 构建工具与 Vite 插件
│   └── alova/                     # Alova 请求库封装
├── docs/                          # 文档层
│   └── website/                   # VitePress 文档站点
├── docker/                        # 容器化配置
│   ├── dev/                       # 开发环境 (仅基础设施容器)
│   ├── prod/                      # 生产环境 (全容器化部署)
│   ├── backend/                   # 后端 Dockerfile
│   └── frontend/                  # 前端 Dockerfile
├── turbo.json                     # Turborepo 任务编排配置
├── pnpm-workspace.yaml            # pnpm 工作区配置
└── package.json                   # 根包配置
```

## 包依赖关系

各层之间的依赖关系遵循单向依赖原则，应用层消费共享包层，共享包之间通过 `builder` 统一构建：

```
┌─────────────────────────────────────────────────────────┐
│                      应用层 (apps/)                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ frontend │    │ backend  │    │ desktop  │           │
│  └────┬─────┘    └──────────┘    └────┬─────┘           │
│       │                               │                  │
│       └──────────────┬────────────────┘                  │
│                      ▼                                   │
│              ┌───────────────┐                           │
│              │  共享包层      │                           │
│              │  (packages/)  │                           │
│  ┌───────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ axios │ │ hooks │ │utils │ │color │ │editor│       │
│  └───┬───┘ └───┬───┘ └──┬───┘ └──┬───┘ └──┬───┘       │
│      └─────────┴────────┴────────┴────────┘             │
│                      ▼                                   │
│              ┌───────────────┐                           │
│              │   builder     │                           │
│              │ (构建工具链)   │                           │
│              └───────────────┘                           │
└─────────────────────────────────────────────────────────┘
```

`builder` 包为所有共享包提供统一的 Vite 构建配置和插件。应用层通过 pnpm workspace protocol（`workspace:*`
）引用共享包，确保始终使用本地最新版本。

## pnpm Workspace

pnpm workspace 通过 `pnpm-workspace.yaml` 定义工作区范围：

```yaml
packages:
  - apps/*
  - docs/*
  - packages/*
```

这意味着 `apps/`、`docs/`、`packages/` 下的每个子目录都是一个独立的 workspace 包。各包之间通过 workspace protocol 相互引用，例如：

```json
{
  "dependencies": {
    "@rapidkit/axios": "workspace:*",
    "@rapidkit/hooks": "workspace:*",
    "@rapidkit/utils": "workspace:*"
  }
}
```

`workspace:*` 表示引用工作区内的本地包，pnpm 会自动创建符号链接，无需发布到 npm registry。

## Turborepo 构建编排

Turborepo 通过 `turbo.json` 定义任务依赖关系和缓存策略，实现智能的增量构建和并行执行：

```json
{
  "tasks": {
    "build": {
      "outputs": ["dist/**"],
      "dependsOn": ["^build"]
    },
    "dev": {
      "persistent": true,
      "cache": false,
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "cache": false,
      "dependsOn": ["^typecheck"]
    }
  }
}
```

关键设计：

- **`^build` 拓扑依赖**：`dependsOn: ["^build"]` 表示当前包的 `build` 任务依赖其所有上游依赖包的 `build` 任务先完成。Turborepo
  自动分析依赖图，按拓扑序执行：先构建 `builder` -> 再构建 `utils`/`axios`/`hooks` 等共享包 -> 最后构建 `frontend`/
  `desktop` 应用。
- **构建缓存**：`build` 任务的产物（`dist/**`）会被缓存，代码未变更时直接复用缓存，跳过构建。
- **开发模式**：`dev` 任务标记为 `persistent: true`（常驻进程）且 `cache: false`（不缓存），但仍依赖上游包先构建完成。
- **并行执行**：无依赖关系的任务会被 Turborepo 自动并行执行，充分利用多核 CPU。

根 `package.json` 中定义了常用的开发命令：

```bash
pnpm dev:frontend    # 先构建共享包，再启动前端开发服务
pnpm dev:backend     # 启动后端开发服务 (uv 管理)
pnpm dev:desktop     # 先构建共享包，再启动桌面端开发服务
pnpm dev:website     # 启动文档站点开发服务
```

## Python 依赖管理 (uv)

后端采用 [uv](https://docs.astral.sh/uv/) 作为 Python 包管理器，独立于 pnpm 工作区管理。uv 兼容 pip
生态，但具备更快的依赖解析和安装速度。后端的依赖声明在 `apps/backend/pyproject.toml` 中，通过 `uv sync` 安装依赖，通过
`uv run` 执行命令。

:::tip
uv 不参与 Turborepo 的任务编排。后端的启动命令 `pnpm dev:backend` 实际上通过 pnpm filter 转发到 `apps/backend` 的 `dev`
脚本，由 uv 负责执行。
:::

## 前后端通信

前端与后端之间通过两种协议通信：

| 协议      | 路径           | 用途                           |
| --------- | -------------- | ------------------------------ |
| REST API  | `/api/v1/*`    | 常规数据 CRUD 操作             |
| Socket.IO | `/socket.io/*` | 实时双向通信（聊天、状态推送） |

后端入口 `main.py` 中的挂载方式：

```python
app = FastAPI(**app_configs, lifespan=lifespan)
app.mount("/socket.io", socket_app)     # Socket.IO 挂载

v1_router = APIRouter(prefix="/api/v1") # REST API 路由前缀
app.include_router(v1_router)
```

前端通过 `@rapidkit/axios` 封装的 HTTP 客户端访问 REST API，通过 `socket.io-client` 库建立 Socket.IO
连接。详细说明参见 [前后端通信](./api.md) 和 [实时通信](./websocket.md)。

## 部署架构

项目支持两种部署模式，通过 `docker/` 目录下的不同 Compose 文件切换。

### 开发模式

开发环境仅容器化基础设施服务（PostgreSQL、Redis、MinIO），应用服务在本地运行：

```
┌────────────────────────────────┐
│   Docker (docker/dev/)         │
│  ┌────────────┐                │
│  │ PostgreSQL │ :35432         │
│  ├────────────┤                │
│  │   Redis    │ :36379         │
│  ├────────────┤                │
│  │   MinIO    │ :9000/:9001    │
│  └────────────┘                │
└────────────────────────────────┘
         ▲
         │ 本地连接
┌────────┴──────────────────────┐
│   本地开发服务                 │
│  ┌──────────┐ ┌────────────┐  │
│  │ Vite Dev │ │ Uvicorn    │  │
│  │ (前端)    │ │ (后端)     │  │
│  └──────────┘ └────────────┘  │
└───────────────────────────────┘
```

### 生产模式

生产环境全部容器化，Nginx 作为反向代理统一入口：

```
                    客户端请求
                       │
                       ▼
┌──────────────────────────────────────────┐
│   Docker (docker/prod/)                  │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │        Nginx (:80)               │    │
│  │  /          → 前端静态文件        │    │
│  │  /api/      → backend-api:8006   │    │
│  │  /socket.io → backend-api:8006   │    │
│  │  /minio/    → minio:9000         │    │
│  └──────────────────────────────────┘    │
│       │            │           │         │
│       ▼            ▼           ▼         │
│  ┌─────────┐ ┌──────────┐ ┌───────┐     │
│  │ Backend │ │ Celery   │ │Celery │     │
│  │   API   │ │ Worker   │ │ Beat  │     │
│  └────┬────┘ └────┬─────┘ └───┬───┘     │
│       │           │            │         │
│       ▼           ▼            ▼         │
│  ┌────────────┐ ┌──────┐ ┌────────┐     │
│  │ PostgreSQL │ │Redis │ │ MinIO  │     │
│  └────────────┘ └──────┘ └────────┘     │
└──────────────────────────────────────────┘
```

Nginx 配置（`docker/prod/nginx.conf`）核心规则：

- `/` 路径提供前端 SPA 静态文件，配合 `try_files` 支持 history 路由模式
- `/api/` 反向代理到后端 API 服务
- `/socket.io/` 反向代理到后端，并开启 WebSocket 升级（`Upgrade` / `Connection` 头）
- `/minio/` 反向代理到 MinIO 对象存储服务

:::info
开发模式下，前端 Vite 开发服务器内置了 HTTP Proxy，将 `/api/` 和 `/socket.io/` 请求代理到后端，无需 Nginx。生产模式下由
Nginx 承担此职责。
:::

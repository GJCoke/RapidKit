# Docker 容器化

项目通过 Docker Compose 提供**开发**和**生产**两套容器编排方案。开发环境仅运行基础设施（数据库、缓存、对象存储），应用代码在宿主机执行；生产环境则将全部 7 个服务打包为容器，统一交付。

## 项目结构

`docker/` 目录按环境和构建目标组织：

```
docker/
├── dev/
│   └── docker-compose.yml       # 开发环境：仅基础设施
├── prod/
│   ├── docker-compose.yml       # 生产环境：全栈 7 服务
│   ├── nginx.conf               # Nginx 反向代理配置
│   └── .env.example             # 生产环境变量模板
├── backend/
│   └── Dockerfile               # 后端多阶段构建（Python 3.14 + uv）
└── frontend/
    └── Dockerfile               # 前端多阶段构建（Node 24 + pnpm -> Nginx）
```

## 开发环境

开发模式只启动基础设施服务，后端和前端在宿主机本地运行，方便调试和热重载。

```bash
# 1. 启动基础设施
dock dev-up

# 2. 启动后端（新终端）
pnpm dev:backend

# 3. 启动前端（新终端）
pnpm dev:frontend
```

### 服务端口映射

| 服务          | 容器端口 | 宿主机端口 | 用途                 |
| ------------- | -------- | ---------- | -------------------- |
| PostgreSQL    | 5432     | 35432      | 数据库               |
| Redis         | 6379     | 36379      | 缓存 / Celery Broker |
| MinIO API     | 9000     | 9000       | 对象存储             |
| MinIO Console | 9001     | 9001       | MinIO 管理面板       |

::: tip 端口规则
基础设施宿主机端口统一加 30000 偏移（如 5432 -> 35432），避免与本地已有服务冲突。MinIO 保持原端口，因为客户端 SDK 通常硬编码 9000。
:::

### 默认凭据

| 服务       | 用户名 | 密码       |
| ---------- | ------ | ---------- |
| PostgreSQL | `root` | `123456`   |
| Redis      | --     | `123456`   |
| MinIO      | `root` | `12345678` |

::: warning
以上仅为开发环境默认值，切勿在生产中使用。
:::

## 生产环境

### 服务架构

生产环境包含 7 个服务，仅 Nginx 的 `18080` 端口对外暴露：

```
Internet -> Nginx (:18080)
               |-- /          -> 前端静态文件 (SPA)
               |-- /api/      -> Backend API (:8006)
               |-- /socket.io/-> WebSocket 代理
               |-- /minio/    -> MinIO 对象存储代理

Backend API  <-> PostgreSQL, Redis, MinIO
Celery Worker <-> PostgreSQL, Redis
Celery Beat   <-> PostgreSQL, Redis
```

7 个服务清单：

| 服务            | 镜像来源               | 说明                      |
| --------------- | ---------------------- | ------------------------- |
| `postgresql`    | `bitnami/postgresql`   | 关系型数据库              |
| `redis`         | `redis:7-alpine`       | 缓存 + Celery Broker      |
| `minio`         | `minio/minio:latest`   | 对象存储                  |
| `backend-api`   | 本地构建               | FastAPI 应用（4 workers） |
| `celery-worker` | 本地构建（同后端镜像） | 异步任务执行器            |
| `celery-beat`   | 本地构建（同后端镜像） | 定时任务调度器            |
| `nginx`         | 本地构建               | 反向代理 + 前端静态托管   |

### 后端镜像

`docker/backend/Dockerfile` 采用多阶段构建：

```dockerfile
# Stage 1: base -- 公共基础层
FROM python:3.14-slim AS base
# 安装 libpq-dev（PostgreSQL 客户端库）
# 从 ghcr.io/astral-sh/uv 复制 uv 二进制

# Stage 2: dev -- 开发容器（volume mount 源码 + --reload）
FROM base AS dev

# Stage 3: prod -- 生产镜像
FROM base AS prod
# uv sync --no-dev 仅安装生产依赖
# 复制 src/, scripts/, alembic/, alembic.ini
# 创建非 root 用户 app:app 并切换
# CMD: uvicorn --workers 4
```

关键设计：

- **共用镜像**：`backend-api`、`celery-worker`、`celery-beat` 三个服务使用同一镜像（`target: prod`），仅通过 `command` 区分启动方式。
- **非 root 运行**：生产阶段创建 `app` 用户，以最小权限运行。
- **uv 管理依赖**：利用 `uv sync --frozen` 保证锁文件一致性。

### 前端镜像

`docker/frontend/Dockerfile` 同样多阶段构建：

```dockerfile
# Stage 1: build
FROM node:24-alpine AS build
# corepack enable + pnpm 10.x
# pnpm install --frozen-lockfile --ignore-scripts
# pnpm turbo build --filter='./packages/*'
# cd apps/frontend && pnpm vite build --mode prod

# Stage 2: serve
FROM nginx:stable-alpine AS serve
# 复制 dist/ 到 /usr/share/nginx/html
# 复制 nginx.conf
```

- 构建阶段基于 `node:24-alpine`，通过 Turborepo 先构建内部包，再构建前端 SPA。
- 运行阶段仅包含 `nginx:stable-alpine` + 编译后的静态文件，最终镜像约 30--40 MB。

## 数据持久化

所有有状态服务数据通过 Docker Named Volumes 持久化：

| Volume 名称       | 服务       | 数据内容       |
| ----------------- | ---------- | -------------- |
| `prod-pg-data`    | PostgreSQL | 数据库文件     |
| `prod-redis-data` | Redis      | 缓存数据       |
| `prod-minio-data` | MinIO      | 上传的文件对象 |

开发环境对应 `dev-pg-data`、`dev-redis-data`、`dev-minio-data`。

::: danger
`dock clean` 会删除所有 volumes，数据将不可恢复。在生产环境执行前务必做好备份。
:::

## 数据库初始化

首次部署或数据库结构变更后，需要执行迁移和初始化：

```bash
# 进入后端容器
docker exec -it monorepo-prod-backend-api bash

# 执行 Alembic 迁移
alembic upgrade head

# 运行初始化脚本（创建默认数据）
uv run python -m src.initdb
```

`alembic upgrade head` 负责创建/更新表结构，`src.initdb` 负责写入初始数据（如默认管理员账号、基础配置等）。

## 首次部署

完整的首次部署流程：

```bash
# 1. 复制环境变量模板
cp docker/prod/.env.example docker/prod/.env.prod

# 2. 编辑 .env.prod，替换所有 CHANGE_ME 值
#    - POSTGRESQL_PASSWORD / REDIS_ROOT_PASSWORD / MINIO_ROOT_PASSWORD
#    - ACCESS_TOKEN_KEY / REFRESH_TOKEN_KEY
#    - RSA_PRIVATE_KEY / RSA_PUBLIC_KEY
#    - CORS_ORIGINS 设为实际域名

# 3. 构建并启动所有服务
dock prod-up

# 4. 初始化数据库
docker exec -it monorepo-prod-backend-api bash
alembic upgrade head
uv run python -m src.initdb
exit

# 5. 验证服务状态
docker compose -f docker/prod/docker-compose.yml ps
```

::: tip
`dock prod-up` 等价于 `docker compose -f docker/prod/docker-compose.yml up -d --build`，会自动构建镜像并以后台模式启动。
:::

## 故障排查

```bash
# 查看所有服务状态
docker compose -f docker/prod/docker-compose.yml ps

# 查看特定服务日志
docker compose -f docker/prod/docker-compose.yml logs backend-api
docker compose -f docker/prod/docker-compose.yml logs nginx

# 进入容器排查
docker exec -it monorepo-prod-backend-api bash
docker exec -it monorepo-prod-redis redis-cli -a <密码>

# 检查端口占用
lsof -i :18080
lsof -i :35432
```

常见问题：

| 现象           | 可能原因                     | 解决方法                                |
| -------------- | ---------------------------- | --------------------------------------- |
| 端口冲突       | 宿主机端口被占用             | `lsof -i :<端口>` 查找占用进程          |
| 数据库连接失败 | PostgreSQL 未就绪            | 检查 healthcheck 状态，等待容器启动完成 |
| 前端白屏       | 未构建或 nginx.conf 配置错误 | 检查 `nginx` 容器日志                   |
| API 502        | 后端未启动或崩溃             | 查看 `backend-api` 日志排查错误         |
| MinIO 上传失败 | `client_max_body_size` 限制  | 确认 nginx.conf 中 `/minio/` 段的配置   |

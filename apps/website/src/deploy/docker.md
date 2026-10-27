# Docker 容器化

项目通过 Docker Compose 提供**开发**和**生产**两套容器编排方案。生产部署入口需要宿主机提供 Python 3.10 或以上版本（仅使用标准库）。开发环境仅运行基础设施（数据库、缓存、对象存储），应用代码在宿主机执行；生产环境则将全部
8 个服务打包为容器，统一交付。

## 项目结构

`docker/` 目录按环境和构建目标组织：

```
docker/
├── dev/
│   └── docker-compose.yml       # 开发环境：仅基础设施
├── prod/
│   ├── docker-compose.yml       # 生产环境：全栈 8 服务
│   ├── deploy-workers.py        # Worker 容量登记与计划退役
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
# 1. 启动基础设施；首次运行时按提示初始化数据库
pnpm rapidkit dev up

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
基础设施宿主机端口统一加 30000 偏移（如 5432 -> 35432），避免与本地已有服务冲突。MinIO 保持原端口，因为客户端 SDK 通常硬编码
9000。
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

生产环境包含 8 个服务，仅 Nginx 的 `18080` 端口对外暴露：

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

8 个服务清单：

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
# Stage 1: manifests -- 自动收集全部 workspace 成员的 pyproject.toml
FROM python:3.14.7-slim AS manifests

# Stage 2: base -- 公共基础层
FROM python:3.14.7-slim AS base
# 从 ghcr.io/astral-sh/uv:0.12.5 复制 uv 二进制（版本固定，保证可复现）
# 复制锁文件与全部 manifest，依赖层不随源码变化失效

# Stage 3: dev -- 开发容器（volume mount 源码 + --reload，venv 位于 /opt/venv）
FROM base AS dev

# Stage 4: prod -- 生产镜像
FROM base AS prod
# uv sync --no-dev 仅安装生产依赖，并预编译字节码；uv 缓存使用 BuildKit cache mount
# 复制全部 Python workspace 成员源码、插件迁移与应用配置（COPY --chown，避免 chown -R 复制整层 venv）
# 以非 root 用户 app:app 运行，venv 归 root 所有且只读
# CMD: uvicorn --workers 4
```

关键设计：

- **共用镜像**：`backend-api`、`celery-worker`、`celery-beat` 三个服务使用同一镜像（`target: prod`），仅通过 `command` 区分启动方式。
- **Worker 组与实例**：`CELERY_WORKER_GROUP` 标识稳定的任务组，每次进程启动生成唯一的 Celery 节点名，支持副本及新旧实例并存。任务记录仍关联实际执行实例。
- **容量与历史**：部署入口将 Compose 的 `deploy.replicas` 登记为该组的期望容量；旧实例计划退出后进入历史，故障实例继续保留在当前列表。容量缺口按组计算，持续 120 秒后生成告警活动，恢复后记录恢复活动；没有声明期望数的组显示“未知”。
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

### HTTP 安全配置

API 和 nginx 使用同一个 `MAX_REQUEST_BODY_BYTES`，默认 `10485760` 字节（10 MiB）。
使用底层 Compose 命令时加 `--env-file docker/prod/.env.prod`，使该值同时用于 nginx 模板替换和后端配置；
nginx 仅接收此限制和 `SECURITY_HSTS_ENABLED`，不加载后端密钥。
超限请求返回 HTTP 200、业务码 `1007`，包含 `code`、`message`、`data` 三个字段。
nginx 按 `Accept-Language` 中首个支持的中文/英文语言选择译文，客户端应按优先级排列语言；
后端使用现有的语言权重解析。MinIO 代理保留独立的 100 MiB 上传限制。

响应统一包含 `nosniff`、`DENY` 和 `strict-origin-when-cross-origin`。
`SECURITY_HSTS_ENABLED=false` 适用于默认 HTTP 部署；配置 HTTPS 后可设为 `true`，
仅 HTTPS 响应附加 `Strict-Transport-Security: max-age=31536000`。

静态首页和资源另外使用 CSP：脚本仅允许同源，样式保留 NaiveUI 所需的动态样式，
图片允许 HTTPS/data/blob，连接允许同源、WebSocket 和 Iconify 的三个图标 API 域名。
若前端改为连接独立 API 域名，应在 `docker/prod/nginx.conf` 两处静态 location 的 `connect-src` 中加入该域；
保持 `script-src 'self'`，不因跨域 API 放宽脚本策略。API JSON 响应不附加前端 CSP。

## Beat 主备与任务互斥

`AsyncDatabaseScheduler` 在共享 `REDIS_URL` 上争用 `leader:celery-beat`：租约 15 秒，
每 5 秒续期。后台事件循环在 Beat 休眠时仍持续运行；备用实例每 5 秒重试，
当选后重新加载数据库任务并重建调度堆。只有领导者发布任务，每次发布前重新检查选举状态。
关闭时释放领导权并关闭 Redis、数据库引擎及后台线程。默认 Compose 仍只启动一个 Beat。

租约不提供任意网络分区或进程长暂停情况下的 exactly-once 保证。
任务自身仍应使用分布式锁或幂等机制；长时间维护任务已显式开启锁自动续期，
丢锁会取消任务，短缓存锁保留不续期的原行为。主备实例必须连接同一 Redis 数据库。

## 数据持久化

异步 HTTP 审计先 `RPUSH audit:pending`，返回后不依赖生产者 API 进程的内存。
一个 `leader:audit-consumer` 消费者通过 `LMOVE` 将记录放入 `audit:processing`，
优先恢复遗留记录，数据库提交成功后才确认删除。重放保留原始 ID、耗时、批量目标及对象快照，
现有数据库 writer 按 ID 幂等，消费者在提交与确认之间崩溃也不会重复插入记录或目标。
权限等关键操作的审计仍在业务事务中同步写入，写入失败会回滚业务操作。

Redis 不可用或排队操作被取消时，已捕获的快照保留在本地队列并记录 WARNING，
恢复后重试写回 Redis，不因达到重试次数而丢弃。Redis 命令等待超过 2 秒也进入该降级。
本地降级队列不设丢弃上限；持续故障时应关注内存和 `queued/flushed/retried/failed/buffer_size` 投递指标。
Redis 完全不可用期间，本地 fallback 仍可能随 API 进程崩溃而丢失，不能将其视为全链路零丢失。

生产 Redis 启用 `appendonly yes`、`appendfsync everysec` 并复用现有数据卷。
这提供 API 崩溃后的审计恢复能力；Redis 自身异常断电仍可能损失最近约一秒尚未刷盘的写入，
数据卷丢失或人为清空 Redis 也不在队列的持久性保证内。

所有有状态服务数据通过 Docker Named Volumes 持久化：

| Volume 名称       | 服务       | 数据内容       |
| ----------------- | ---------- | -------------- |
| `prod-pg-data`    | PostgreSQL | 数据库文件     |
| `prod-redis-data` | Redis      | 缓存数据       |
| `prod-minio-data` | MinIO      | 上传的文件对象 |

开发环境对应 `dev-pg-data`、`dev-redis-data`、`dev-minio-data`。

::: danger
`pnpm rapidkit clean docker` 会删除所有 volumes，数据将不可恢复。在生产环境执行前务必做好备份。
:::

## 数据库初始化

开发环境的数据库迁移和初始化统一通过 RapidKit CLI 执行：

```bash
pnpm rapidkit db status
pnpm rapidkit db migrate -m "描述模型变更"
pnpm rapidkit db upgrade
pnpm rapidkit db seed
```

生产环境首次部署不需要手工进入容器执行 Alembic。`pnpm rapidkit prod up` 会在确认后于后端容器中完成迁移和 seed。

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
pnpm rapidkit prod up
# 首次部署时，对“初始化数据库”和二次确认均选择“是”

# 4. 验证服务状态（底层排障命令）
docker compose -f docker/prod/docker-compose.yml ps
```

::: tip
`pnpm rapidkit prod up` 会构建镜像、启动基础设施，按确认结果执行 seed，并通过 Worker 部署入口执行必要迁移、登记期望容量、替换和退役旧实例，最后启动 Nginx。已有数据库可跳过 seed，必要的迁移仍会执行。
:::

## 故障排查

```bash
# 查看所有服务状态
docker compose -f docker/prod/docker-compose.yml ps

# 跟踪生产环境日志（优先）
pnpm rapidkit prod logs

# 查看指定服务（底层排障）
docker compose -f docker/prod/docker-compose.yml logs backend-api nginx

# 进入容器排查
docker exec -it rapidkit-prod-backend-api bash
docker exec -it rapidkit-prod-redis redis-cli -a <密码>

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

## 生产镜像与迁移

后端镜像包含四个 Python 共享包、全部插件源码和迁移，使用锁文件安装生产依赖，以非 root 用户运行。
`backend-migrate` 每次发布先执行 `alembic upgrade heads`；API、worker 和 beat 仅在其成功退出后启动。
部署已有环境时先重新运行该一次性服务，不能依靠已退出容器的历史成功状态：

```bash
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml build
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml run --rm backend-migrate
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml up -d
```

自动迁移不调用 `initdb`。该脚本虽然补缺逻辑可重复执行，但会创建示例账号；首次种子初始化须作为单独运维步骤审查，生产不得使用 `--reset`。
ACCESS/REFRESH/IMPERSONATION 三个签名密钥必须独立配置，RSA 密钥需要匹配。
MinIO 从固定安全发布 `RELEASE.2025-10-15T17-29-55Z` 构建，首次构建需要获取上游源码和 Go 依赖。

## 健康检查与停机

`/health/live` 只检查进程；`/health/ready` 在每项 2 秒超时内并发检查 PostgreSQL 和 Redis。
任一依赖不可用时 ready 返回 HTTP 503，不包含连接配置。两个接口均无需登录、无审计与流量统计，nginx 对公网返回 404。
Compose 在容器内调用 ready，不发布后端端口。收到 TERM/INT 后 ready 标记为未就绪，随后沿用 Uvicorn 的退出流程。
Uvicorn 等待进行中请求最多 30 秒，Compose 停机宽限 45 秒。Compose **不会按健康状态自动摘除副本**，因此这不是零丢请求的滚动发布保证。

## 多副本与真实客户端 IP

```bash
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml up -d --scale backend-api=2 backend-api
```

API 和 Worker 不固定 `container_name`，Beat 默认保持一个。Worker 的扩缩容使用下文部署入口，让期望容量与实例退役同步更新。
nginx 每 10 秒刷新 Docker DNS，API 和 Socket.IO 都保留完整 URI 与 query。连接失败或超时最多换一个上游，已发送到上游的非幂等请求不会重试。
Uvicorn 只信任 `FORWARDED_ALLOW_IPS` 指定网段；默认与 compose 网络 `172.30.0.0/24` 一致。若网段冲突，同时修改网络 subnet 与 env。
共享客户端地址读取只使用 Uvicorn 解析后的 ASGI client，不直接采信 CF-Connecting-IP/X-Real-IP/XFF。后端端口不对外发布。
如果前置新的负载均衡、CDN 或 TLS 终止层，必须重新审核该信任链和 HSTS 位置。

### GitLab CD 与可替换钩子

仓库提供 `deploy/release.py` 发布核心和 `deploy/examples/` 下的独立示例。核心只调用钩子协议，必须显式选择配置；ACR、OSS、SSH、Compose 等不会被自动启用。

GitLab 入口执行：受保护版本 tag → 检查与构建 → 手动生产部署。示例发布过程为：预检 → 维护停写 → PostgreSQL 备份上传 OSS 并校验 → 迁移 → 启动验证 → 解除维护。迁移开始后的失败保留维护，不自动降级或覆盖数据库。

首次使用前，按仓库 `deploy/README.md` 与 `deploy/examples/aliyun/README.md` 配置权限、变量和显式 profile，并导入当前生产版本。示例钩子可以直接接入，也可以逐项替换；更换存储方式无需修改发布核心。

接入后，版本、配置及容量更新使用该发布入口。以下旧 Worker 脚本只适用于未接入 CD 的环境；检测到受发布流程管理的容器时会拒绝执行，避免跳过维护及备份。

### Worker 部署与扩缩容

`.env.prod` 中的配置同时控制 Compose 副本数和监控期望容量：

```dotenv
CELERY_WORKER_GROUP=prod/default
CELERY_WORKER_REPLICAS=3
```

修改副本数后运行（设为 `0` 即暂停该组）：

```bash
python3 docker/prod/deploy-workers.py --build
```

脚本先执行迁移并启动 API/Beat，随后登记部署意图、替换所选 Worker 容器，Docker 返回成功后退役旧实例。新实例未就绪时仍显示容量不足；本入口使用停止并重建，不承诺滚动发布或零停机。Worker 停机宽限为 120 秒，超时后 Docker 可终止未完成任务；长任务部署应按实际耗时调整 `stop_grace_period`。

未接入 CD 的环境若只需替换 Worker，不执行迁移或更新 API/Beat，可使用 `--workers-only`。涉及数据库迁移和正式版本更新，推荐使用上面的受维护及备份门禁保护的发布流程。

只启动新容器并不能证明容量已恢复，监控通过注册及心跳确认在线状态。脚本失败会尝试撤销未完成的意图并恢复之前的期望数，保留实际故障状态；退出时会输出部署 token。若意图撤销也失败，可在修复数据库连接后恢复：

```bash
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml run --rm --no-deps backend-api \
  python -m plugin_worker.deployment abort --group prod/default --deployment <部署token>
```

直接 `docker compose up --scale celery-worker=N` 不会登记期望容量或计划退役，应使用部署入口。每次启动的节点名本来就不同，默认页面展示稳定的组名及容量，历史实例保留任务关联。

首次升级时，缺少组和启动身份的旧节点记录统一导入 `legacy` 历史组，任务记录保持原样。升级后需重启所有 Worker，使用 `plugin_worker.launcher` 注册新的实例。旧的 `CELERY_WORKER_NAMES` 仅作为 legacy 节点清单兼容，新组无需维护每个实例的名字。

若以后需要不同队列的独立容量，可新增 Compose 覆盖文件，例如：

```yaml
# docker/prod/worker-groups.yml
services:
  celery-reports:
    extends:
      file: docker-compose.yml
      service: celery-worker
    command: ["python", "-m", "plugin_worker.launcher", "-Q", "reports"]
    environment:
      CELERY_WORKER_GROUP: prod/reports
    deploy:
      replicas: 2
```

```bash
python3 docker/prod/deploy-workers.py \
  -f docker/prod/docker-compose.yml -f docker/prod/worker-groups.yml \
  --service celery-worker --service celery-reports
```

同一组的全部服务需一起部署，脚本会合计它们的副本数。不同 Compose 项目使用不同组名，避免彼此覆盖期望容量。主机脚本调用容器运行时，应用容器无需挂载 Docker socket。

### Prometheus 内部抓取

API 在容器根路径 `/metrics` 提供 Prometheus 文本指标，包含按路由模板统计的请求数、延迟和正在处理的请求数；业务错误即使返回 HTTP 200 也计为 error。标签中不使用用户、请求 ID、原始资源 ID 或查询参数。`/health/*` 和 `/metrics` 本身不进入统计或限流，nginx 对这些内部出口返回 404。

Compose 只在 API 服务中导出 `PROMETHEUS_MULTIPROC_DIR=/tmp/rapidkit-prometheus`，并在 Uvicorn import 前生效。API entrypoint 每次容器主进程启动前清理旧指标文件，worker 进程启动和 lifespan 不会清空计数；优雅退出与抓取时会清理死进程的 live gauge。worker、beat、迁移进程移除此变量。自定义启动命令应保留同样的环境注入和主进程清理顺序。

四个 Uvicorn worker 在一个副本内汇总。多个 API 副本之间不共享目录，scraper 应通过内部网络逐副本访问 `:8006/metrics`（例如基于服务发现逐个枚举容器），不能通过 nginx 随机抓到其中一个副本。项目不附带 Prometheus/Grafana 服务；本地不设置该变量时使用独立的进程内 registry。

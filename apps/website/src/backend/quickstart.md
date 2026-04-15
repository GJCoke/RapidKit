# 首次部署

本指南帮助你从零搭建后端开发环境并启动服务。

## 前置条件

- Python >= 3.14
- [uv](https://docs.astral.sh/uv/)（Python 包管理器）
- Docker + Docker Compose（Docker 路径）
- Node.js >= 24 + pnpm >= 10（monorepo 工具链）
- Git

:::info 安装提示

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装 pnpm
corepack enable && corepack prepare pnpm@latest --activate
```

:::

## 获取代码

```bash
git clone <repo-url>
cd rapidkit
pnpm install  # 安装前端及 monorepo 依赖
```

## 基础设施

:::tabs

== Docker（推荐）

```bash
# 创建外部网络（首次）
docker network create app_network

# 启动 PostgreSQL + Redis + MinIO
cd apps/backend
docker compose up -d app_postgresql app_redis app_minio
```

各服务暴露的端口和默认凭据：

| 服务         | 容器端口 | 宿主机端口 | 默认用户 / 密码     |
| ------------ | -------- | ---------- | ------------------- |
| PostgreSQL   | 5432     | 35432      | `root` / `123456`   |
| Redis        | 6379     | 36379      | 无用户 / `123456`   |
| MinIO        | 9000     | 9000       | `root` / `12345678` |
| MinIO 控制台 | 9001     | 9001       | 同上                |

== 裸机安装

**PostgreSQL 15+**

```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Ubuntu / Debian
sudo apt install postgresql-15
sudo systemctl start postgresql
```

创建数据库和用户：

```sql
CREATE USER root WITH PASSWORD '123456';
CREATE DATABASE client OWNER root;
```

**Redis 6+**

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu / Debian
sudo apt install redis-server
sudo systemctl start redis
```

设置密码（编辑 `redis.conf`）：

```conf
requirepass 123456
```

**MinIO**

```bash
# macOS
brew install minio/stable/minio
minio server /data --console-address ":9001"

# 或使用官方安装脚本
# 参见 https://min.io/docs/minio/linux/index.html
```

:::

## 环境变量配置

```bash
cd apps/backend
cp .env.example .env
```

按需修改 `.env` 文件中的配置项：

### PostgreSQL

| 变量                      | 说明       | 默认值               |
| ------------------------- | ---------- | -------------------- |
| `POSTGRESQL_ASYNC_SCHEME` | 异步驱动   | `postgresql+asyncpg` |
| `POSTGRESQL_SYNC_SCHEME`  | 同步驱动   | `postgresql+psycopg` |
| `POSTGRESQL_USERNAME`     | 用户名     | `root`               |
| `POSTGRESQL_PASSWORD`     | 密码       | `123456`             |
| `POSTGRESQL_HOST`         | 数据库地址 | `app_postgresql`     |
| `POSTGRESQL_PORT`         | 端口       | `5432`               |
| `POSTGRESQL_DATABASE`     | 数据库名   | `client`             |

### Redis

| 变量                    | 说明       | 默认值      |
| ----------------------- | ---------- | ----------- |
| `REDIS_HOST`            | Redis 地址 | `app_redis` |
| `REDIS_PORT`            | 端口       | `6379`      |
| `REDIS_ROOT_PASSWORD`   | 密码       | `123456`    |
| `REDIS_MAX_CONNECTIONS` | 最大连接数 | `10`        |

### Celery

| 变量                    | 说明             | 默认值          |
| ----------------------- | ---------------- | --------------- |
| `CELERY_REDIS_DATABASE` | Redis 数据库编号 | `1`             |
| `DATETIME_TIMEZONE`     | 时区             | `Asia/Shanghai` |

### MinIO

| 变量                  | 说明   | 默认值     |
| --------------------- | ------ | ---------- |
| `MINIO_ROOT_USER`     | 用户名 | `root`     |
| `MINIO_ROOT_PASSWORD` | 密码   | `12345678` |

### Socket.IO Admin

| 变量                      | 说明   | 默认值   |
| ------------------------- | ------ | -------- |
| `SOCKETIO_ADMIN_USERNAME` | 用户名 | `admin`  |
| `SOCKETIO_ADMIN_PASSWORD` | 密码   | `123456` |

### 其他

| 变量           | 说明             | 默认值  |
| -------------- | ---------------- | ------- |
| `ENVIRONMENT`  | 运行环境         | `LOCAL` |
| `CORS_ORIGINS` | 跨域允许的来源   | `["*"]` |
| `CORS_HEADERS` | 跨域允许的请求头 | `["*"]` |

:::warning 认证密钥
`ACCESS_TOKEN_KEY`、`REFRESH_TOKEN_KEY`、`RSA_PRIVATE_KEY`、`RSA_PUBLIC_KEY` 在 `LOCAL` / `TESTING` 环境会自动生成，但\* \*生产环境必须手动配置\*\*。
:::

:::tip 裸机用户注意
使用裸机安装时，需要将 `POSTGRESQL_HOST` 改为 `127.0.0.1`，`REDIS_HOST` 改为 `127.0.0.1`。
:::

## 安装 Python 依赖

```bash
cd apps/backend
uv sync        # 安装依赖
uv sync --dev  # 包含开发依赖（推荐）
```

## 数据库迁移

```bash
uv run alembic upgrade heads
```

[Alembic](https://alembic.sqlalchemy.org/) 是 SQLAlchemy 的数据库迁移工具。项目采用多分支迁移策略，每个插件维护独立的迁移分支，`upgrade heads`（注意复数）会将所有分支迁移到最新版本。

## 初始化数据（可选）

```bash
uv run python -m src.initdb
```

初始化以下数据：

- **超级管理员账号** — `admin` / `123456`
- **默认角色** — `ADMIN`（管理员）、`USER`（普通用户）
- **默认菜单结构** — 侧边栏页面路由

## 启动服务

```bash
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 16000
```

或使用 monorepo 脚本：

```bash
pnpm run dev:backend
```

## 验证

- 访问 `http://localhost:16000/docs` 查看 Swagger UI（需要 `ENVIRONMENT=LOCAL` 或 `TESTING`）
- 使用初始化的管理员账号测试登录接口

## 常用命令速查

| 命令                                               | 说明             |
| -------------------------------------------------- | ---------------- |
| `pnpm run dev:backend`                             | 启动开发服务器   |
| `uv run alembic upgrade heads`                     | 应用所有分支迁移 |
| `uv run alembic revision --autogenerate -m "desc"` | 生成迁移         |
| `uv run ruff check --fix src`                      | Lint 检查        |
| `uv run ruff format src`                           | 代码格式化       |
| `uv run ty check src`                              | 类型检查         |
| `uv run pytest`                                    | 运行测试         |

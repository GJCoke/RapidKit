# 快速开始

## 环境准备

确保你的环境满足以下要求：
::: warning 注意
请确保你的环境满足需求，否则会导致安装失败。
:::

- git: 你需要 git 来克隆和管理项目版本。
- Node.js: >= 24.11.0，推荐使用更高版本
- pnpm: >= 10.20.0，推荐使用最新版本
- uv: >= 0.9.15，推荐使用最新版本
- Python: >= 3.14，推荐使用更高的兼容版本 (可使用`uv`自动安装)
- Docker / Podman (可选)

## 安装 `uv`

一个用 `Rust` 编写的极速 `Python` 包和项目管理工具。
::: tabs
=== MacOS/Linux
使用 `curl` 下载脚本并通过 `sh` 执行：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

如果系统没有 `curl`，可以使用 `wget`：

```bash
wget -qO- https://astral.sh/uv/install.sh | sh
```

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install uv
```

=== Windows
使用 `irm` 下载脚本并通过 `iex` 执行：

```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

更改 [执行策略](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-7.4#powershell-execution-policies) 允许运行来自互联网的脚本。
:::

::: info 提示
更多安装方式请查看 [uv 官方文档](https://uv.doczh.com/getting-started/installation/#pypi)
:::

### 验证安装

```bash
uv --version
```

## 安装 Node.js

### 官方安装包

1. 访问 Node.js 官网：https://nodejs.org/
2. 下载 **LTS（长期支持）** 版本
3. 按照系统安装向导安装即可

### 使用 Homebrew（macOS / Linux）

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install node
```

### 验证安装

```bash
node -v   # 查看 Node.js 版本
npm -v    # 查看 npm 版本
```

## 安装 `pnpm`

### 使用 npm 安装 (推荐)

前提：你已经安装了 Node.js（v24.11+）

```bash
npm install -g pnpm
```

### 使用 Homebrew（macOS / Linux）

如果你使用 `Homebrew` 也可以通过 `Homebrew` 安装

```bash
brew install pnpm
```

### 验证安装

```bash
pnpm -v
```

## 安装 Git

::: tabs
== MacOS

#### 通过 Homebrew（推荐）

```bash
brew install git
```

#### 通过官方安装包

1. 访问 Git 官网：https://git-scm.com/
2. 下载 macOS 安装包
3. 按照系统安装向导安装即可
   == Windows

#### 官方安装包

1. 下载：https://git-scm.com/install/windows
2. 下载 Windows 安装包
3. 按照系统安装向导安装即可

#### 通过包管理器（如 Chocolatey）

```bash
choco install git
```

== Linux

```bash
sudo apt update
sudo apt install git -y
```

:::

### 验证安装

```bash
git --version
```

## 代码获取

### 从 GitHub 获取代码

```bash
git clone https://github.com/GJCoke/monorepo-example.git
```

## 安装依赖

::: danger 注意
因为项目使用了 `monorepo` 工程管理，所以只能使用 `pnpm` 进行安装，请勿使用 `npm` 或 `yarn`
:::

```bash
pnpm install
```

## 启动项目

::: tabs
== 前端

```bash
pnpm dev:frontend
```

== 后端

```bash
pnpm dev:backend
```

== 桌面端

```bash
pnpm dev:desktop
```

== 官网

```bash
pnpm dev:website
```

:::

## Celery 任务队列启动

项目使用 Celery 作为异步任务队列，支持后台任务处理、定时调度和 Worker 监控。

### 前置条件

::: warning 注意
启动 Celery 前，请确保以下服务已就绪：

- **Redis** 已启动并可访问 -- Celery 使用 Redis 作为消息代理 (Broker) 和结果后端 (Backend)
- **PostgreSQL** 已启动 -- Beat 调度器使用数据库存储定时任务配置
- 后端 `.env` 文件中的数据库与 Redis 连接信息已正确配置
  :::

### 环境变量配置

在 `apps/backend/.env` 文件中确认以下配置项：

```dotenv
# Redis 连接配置 (Celery 使用独立的 Redis 数据库)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ROOT_PASSWORD=your_password
CELERY_REDIS_DATABASE=1

# 启用 Celery 监控功能 (Worker 事件消费、状态监控、管理 API)
ENABLE_CELERY_MONITOR=true
```

::: info 说明
Celery 的 Broker 和 Backend 均使用 Redis，连接地址由 `CELERY_REDIS_URL` 属性自动生成，格式为 `redis://:password@host:port/database`。其中 `CELERY_REDIS_DATABASE` 默认为 `1`，与主应用 Redis 数据库 (默认 `0`) 隔离。
:::

### 启动 Worker

Worker 负责执行异步任务。在 `apps/backend/` 目录下运行：

```bash
uv run celery -A src.queues.app worker -l info
```

### 启动 Beat 调度器

Beat 负责按计划发送定时任务。项目使用自定义的 `AsyncDatabaseScheduler`，将定时任务配置存储在 PostgreSQL 中：

```bash
uv run celery -A src.queues.app beat -S src.queues.scheduler:AsyncDatabaseScheduler -l info
```

::: tip 提示
开发阶段可以将 Worker 和 Beat 分别在两个终端窗口中运行，方便查看各自的日志输出。
:::

### 常见问题

#### Redis 连接被拒绝

```
[ERROR] consumer: Cannot connect to redis://localhost:6379/1: Connection refused.
```

请检查 Redis 服务是否已启动：

```bash
redis-cli ping  # 应返回 PONG
```

如果使用 Docker 运行 Redis，确认容器已启动且端口映射正确：

```bash
docker compose -f docker-compose.dev.yaml up -d redis
```

#### Broker URL 不匹配

如果 Worker 启动后无法接收任务，请确认 `.env` 中的 Redis 连接参数与实际 Redis 服务一致。Celery 的 Broker URL 由以下环境变量共同决定：

- `REDIS_SCHEME` -- 协议，默认 `redis`
- `REDIS_HOST` -- 地址
- `REDIS_PORT` -- 端口，默认 `6379`
- `REDIS_ROOT_PASSWORD` -- 密码
- `CELERY_REDIS_DATABASE` -- 数据库编号，默认 `1`

#### 监控功能未生效

如果启动 Worker 后在前端看不到 Worker 状态信息，请确认 `ENABLE_CELERY_MONITOR=true` 已在 `.env` 中设置。该选项控制是否加载事件消费和 Worker 监控模块。

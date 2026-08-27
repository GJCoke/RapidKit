# 后端首次启动

本指南介绍如何从零启动 RapidKit 后端开发环境。项目统一使用 `pnpm rapidkit` 管理基础设施和数据库，不需要手工创建 Docker 网络或直接运行 Alembic。

## 前置条件

- Python >= 3.14
- [uv](https://docs.astral.sh/uv/)
- Node.js >= 24、pnpm >= 10
- Docker Compose 或 Podman Compose
- Git

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 启用 pnpm
corepack enable
```

## 获取代码与安装依赖

```bash
git clone <repo-url>
cd rapidkit
pnpm install
uv sync --dev
```

所有命令都应在仓库根目录执行。

## 配置后端环境变量

```bash
cp apps/backend/.env.example apps/backend/.env
```

本地开发默认连接 CLI 启动的 PostgreSQL、Redis 和 MinIO。若使用自建服务，请在 `apps/backend/.env` 中修改对应主机、端口和凭据。

::: warning 认证密钥
`ACCESS_TOKEN_KEY`、`REFRESH_TOKEN_KEY`、`RSA_PRIVATE_KEY`、`RSA_PUBLIC_KEY` 在 `LOCAL` / `TESTING` 环境可以自动生成；生产环境必须显式配置固定密钥。
:::

## 启动基础设施并初始化数据库

```bash
pnpm rapidkit dev up
```

CLI 启动 PostgreSQL、Redis 和 MinIO 后，会询问：

```text
是否初始化数据库？(Alembic 迁移 + 种子数据)
```

首次运行请选择“是”。CLI 会自动检测各插件的模型变更、生成缺失的初始迁移、升级数据库，并写入默认管理员、角色和菜单数据。以后仅启动已有环境时可以选择“否”。

默认基础设施端口如下：

| 服务          | 地址                    | 默认凭据            |
| ------------- | ----------------------- | ------------------- |
| PostgreSQL    | `localhost:35432`       | `root` / `123456`   |
| Redis         | `localhost:36379`       | 无用户 / `123456`   |
| MinIO API     | `http://localhost:9000` | `root` / `12345678` |
| MinIO Console | `http://localhost:9001` | `root` / `12345678` |

## 启动后端

```bash
pnpm dev:backend
```

访问 `http://localhost:16000/docs` 查看 Swagger UI（仅 `LOCAL` / `TESTING` 环境开放）。默认管理员账号为 `admin`，密码为 `123456`。

## 后续数据库操作

数据库工作流也统一通过 CLI 执行：

```bash
# 查看迁移状态
pnpm rapidkit db status

# 检测模型变更并生成迁移
pnpm rapidkit db migrate -m "add user field"

# 应用迁移
pnpm rapidkit db upgrade

# 重新写入种子数据
pnpm rapidkit db seed
```

直接运行 Alembic 仅适用于排查 CLI 底层行为。正常开发流程不要手工维护插件分支参数或版本目录。

## 常用命令

| 命令                                 | 说明                               |
| ------------------------------------ | ---------------------------------- |
| `pnpm rapidkit dev up`               | 启动基础设施，可交互式初始化数据库 |
| `pnpm rapidkit dev down`             | 停止基础设施                       |
| `pnpm rapidkit dev logs`             | 跟踪基础设施日志                   |
| `pnpm dev:backend`                   | 启动后端开发服务器                 |
| `pnpm rapidkit db migrate -m "描述"` | 生成插件迁移                       |
| `pnpm rapidkit db upgrade`           | 应用全部迁移                       |
| `pnpm rapidkit db status`            | 查看迁移状态                       |
| `pnpm rapidkit db seed`              | 写入初始化数据                     |
| `uv run pytest`                      | 运行后端测试                       |

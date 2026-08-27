# RapidKit CLI

RapidKit CLI 是项目统一的开发、数据库和部署入口。请在仓库根目录通过 `pnpm rapidkit` 运行，无需全局安装额外命令。

```bash
# 打开交互式菜单
pnpm rapidkit

# 也可以直接执行子命令
pnpm rapidkit dev up
pnpm rapidkit prod up
pnpm rapidkit db status
```

## 首次开发启动

```bash
pnpm install
pnpm rapidkit dev up
```

`dev up` 会启动 PostgreSQL、Redis 和 MinIO，然后询问是否初始化数据库。首次运行请选择“是”，CLI 将自动：

1. 检测各插件的模型变更并生成缺失的初始迁移。
2. 将所有迁移升级到最新版本。
3. 写入默认管理员、角色、菜单等种子数据。

基础设施就绪后，分别启动应用：

```bash
pnpm dev:backend
pnpm dev:frontend
```

## 首次生产部署

配置 `docker/prod/.env.prod` 后执行：

```bash
pnpm rapidkit prod up
```

`prod up` 会构建生产镜像、启动基础设施，并询问是否初始化数据库。首次部署请选择“是”并通过二次确认，CLI 会在后端容器中执行迁移和 seed，随后启动全部服务。

::: warning
生产环境的二次确认用于防止误操作。首次部署需要确认初始化；已有数据库的常规启动通常应跳过初始化。
:::

## 命令速查

| 命令                                 | 说明                                     |
| ------------------------------------ | ---------------------------------------- |
| `pnpm rapidkit dev up`               | 启动开发基础设施，可交互式初始化数据库   |
| `pnpm rapidkit dev down`             | 停止开发基础设施                         |
| `pnpm rapidkit dev logs`             | 跟踪开发基础设施日志                     |
| `pnpm rapidkit prod build`           | 构建生产镜像                             |
| `pnpm rapidkit prod up`              | 构建并启动生产环境，可交互式初始化数据库 |
| `pnpm rapidkit prod down`            | 停止生产环境                             |
| `pnpm rapidkit prod logs`            | 跟踪生产环境日志                         |
| `pnpm rapidkit db migrate -m "描述"` | 检测模型变更并交互式生成迁移             |
| `pnpm rapidkit db upgrade`           | 应用全部迁移                             |
| `pnpm rapidkit db status`            | 查看迁移状态                             |
| `pnpm rapidkit db seed`              | 写入种子数据                             |
| `pnpm rapidkit clean docker`         | 删除容器、数据卷和本地生产镜像           |

## Docker / Podman 运行时

CLI 会自动检测容器运行时。也可以临时指定，或保存到仓库本地配置：

```bash
# 仅本次命令生效
pnpm rapidkit --runtime podman dev up

# 保存到 .rapidkitrc.local.json
pnpm rapidkit config set runtime podman
```

::: danger
`pnpm rapidkit clean docker` 会删除开发和生产环境的数据卷，并删除本地构建的生产镜像。数据不可恢复，执行前务必备份。
:::

## 底层命令

CLI 最终会调用 `docker compose` 或 `podman compose`。仅在 CLI 无法完成诊断时，才建议直接使用 Compose；日常操作应优先使用 `pnpm rapidkit`，以保持运行时选择、路径和数据库流程一致。

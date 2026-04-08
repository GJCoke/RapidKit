# dock CLI 工具

`dock` 是项目自带的容器管理命令行工具，封装了 Docker Compose 命令，提供交互式菜单和命令模式两种使用方式，并支持 Docker / Podman 双运行时。

## 安装

脚本位于仓库根目录，通过软链接安装到 PATH：

```bash
# 在项目根目录执行（仅需一次）
sudo ln -sf "$(pwd)/dock" /usr/local/bin/dock
```

安装后即可在任意位置使用 `dock` 命令。也可以不安装，直接在项目根目录通过 `./dock` 调用。

## 两种使用模式

### 交互式模式

不带参数直接运行 `dock`，会显示菜单供选择：

```
dock -- Monorepo Container Management

  Development
    1) dev-up        Start infrastructure (PostgreSQL, Redis, MinIO)
    2) dev-down      Stop infrastructure
    3) dev-logs      Follow infrastructure logs

  Production
    4) prod-build    Build production images
    5) prod-up       Build and start full stack
    6) prod-down     Stop production stack
    7) prod-logs     Follow production logs

  Cleanup
    8) clean         Remove all containers, volumes, and images

    0) exit

> Select command:
```

输入对应数字即可执行操作。

### 命令模式

直接指定子命令跳过菜单，适合脚本调用和 CI/CD 场景：

```bash
dock dev-up       # 启动开发基础设施
dock prod-up      # 构建并启动生产全栈
dock clean        # 清理所有容器、卷和镜像
```

## 命令参考

| 命令              | 说明                                         |
| ----------------- | -------------------------------------------- |
| `dock dev-up`     | 启动开发基础设施（PostgreSQL、Redis、MinIO） |
| `dock dev-down`   | 停止开发基础设施                             |
| `dock dev-logs`   | 查看开发基础设施日志（实时跟踪）             |
| `dock prod-build` | 仅构建生产镜像，不启动容器                   |
| `dock prod-up`    | 构建镜像并启动生产环境全栈（`--build -d`）   |
| `dock prod-down`  | 停止生产环境所有容器                         |
| `dock prod-logs`  | 查看生产环境日志（实时跟踪）                 |
| `dock clean`      | 停止所有容器，删除数据卷和本地构建的镜像     |

其他选项：

| 选项                       | 说明               |
| -------------------------- | ------------------ |
| `--runtime docker\|podman` | 手动指定容器运行时 |
| `--help` / `-h`            | 显示帮助信息       |

## Docker / Podman 自动检测

`dock` 同时兼容 Docker 和 Podman 两种容器运行时，检测逻辑如下：

1. **仅安装一个**：自动使用已安装的运行时，无需任何配置。
2. **同时安装两个**：弹出交互式选择菜单：

   ```
   Detected both Docker and Podman

     1) docker
     2) podman

   > Select runtime [1]:
   ```

3. **手动指定**：通过 `--runtime` 标志跳过检测：
   ```bash
   dock --runtime podman dev-up
   dock --runtime docker prod-up
   ```
4. **均未安装**：报错退出。

::: info Podman Compose
当运行时为 Podman 时，`dock` 优先使用 `podman-compose`（如已安装），否则回退到 `podman compose` 子命令。
:::

## 工作原理

`dock` 是一个纯 Bash 脚本，核心逻辑如下：

- 自动定位 `docker/dev/docker-compose.yml` 和 `docker/prod/docker-compose.yml`，路径基于脚本自身位置解析，因此软链接安装后仍能正确找到 compose 文件。
- 每条命令本质上是对 `docker compose -f <file> <子命令>` 的封装。
- `clean` 命令会同时清理开发和生产环境：对开发环境执行 `down -v`，对生产环境执行 `down -v --rmi local`（额外删除本地构建的镜像）。

::: danger
`dock clean` 会删除所有数据卷，开发和生产数据均不可恢复。执行前请确认已做好备份。
:::

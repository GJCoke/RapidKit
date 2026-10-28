# GitLab + ACR + SSH + Compose + PostgreSQL + OSS 示例

这里提供可实际执行的示例钩子，不是发布核心的默认实现。只有显式设置 `RELEASE_PROFILE_FILE=deploy/examples/aliyun/profile.json`（或选择自己的配置）才会使用它们。可复制 profile 后逐项替换钩子。

## 前置条件

- GitLab Runner 使用 Linux Docker executor；本示例构建任务采用 Docker-in-Docker TLS，需要专用受保护 Runner 允许 privileged，并共享 `/certs/client`。如现有 Runner 使用宿主 Docker，修改 GitLab 构建 job 的服务/连接配置即可，核心不变。
- Runner 有 Python 3.10+、Docker/Buildx 和 ACR 推送网络；构建镜像提供的工具由 GitLab 入口配置。
- 生产服务器已有正在使用的 Compose 项目，PostgreSQL/Redis/MinIO 健康；已有 Alembic revisions，现有生产 `.env` 可用。
- 目标有 Python 3.10+、Docker Compose 2.24+、OpenSSH、tar 和 ossutil 2.2+。先固定线上 PostgreSQL 镜像版本，再单独规划数据库主版本升级。保留 baseline 的固定镜像标签和需要恢复的应用镜像，不在发布期间运行全局镜像/容器清理。
- 专用部署账号可操作 Docker 和受限发布目录；Docker 权限接近 root 权限。只允许受信代码、tag 和 Runner 使用。
- OSS Bucket 私有、开启服务端加密；推荐同地域 HTTPS 内网 Endpoint，配置备份前缀 90 天生命周期及过期分片清理。

`profile.json` 的 runtime/database options 必须使用相同项目名和 Worker 服务清单。示例默认项目名 `rapidkit-prod`，公开入口 `http://127.0.0.1:18080/`，正常退出最多等待 600 秒、启动验证最多等待 180 秒。按实际部署修改这份可选 profile；这里的参数不会成为核心默认绑定。

项目名、现有 Compose 网络、数据卷必须保持一致。自定义 Worker 服务时，将 Compose 定义放在 `deploy/` 内，在 runtime/database options 的 `compose_files` 中配置 `{bundle}/deploy/custom/worker-groups.yml`，并同步 `worker_services` 列表；示例会拒绝遗漏已配置 Worker。不要通过修改项目名创建一套空数据库冒充发布成功。已有 Worker 服务的组名和服务名变更须单独维护；普通发布支持增加服务和按组调整副本，暂停可设为 0。

## GitLab 变量

在 Settings → CI/CD → Variables 配置。生产凭据设为 Protected，Environment scope 为 `production`；推送凭据的 Environment scope 设为 `image-build`；生产凭据设为 `production`。保护 `v*` tag，只有受信角色可创建，正式 tag 的提交必须属于默认分支历史。

| 变量 | 用途 |
| --- | --- |
| `RELEASE_PROFILE_FILE` | 仓库内显式选择的 profile 路径，所有相关任务可用，不设默认值 |
| `ACR_BACKEND_REPOSITORY` / `ACR_FRONTEND_REPOSITORY` | 完整仓库路径，不带 tag，构建任务使用 |
| `ACR_REGISTRY` | 实际 ACR 登录域名，构建和生产任务都可用 |
| `ACR_PUSH_USERNAME` / `ACR_PUSH_PASSWORD` | 构建推送身份；密码设为 Masked/Hidden（如格式允许） |
| `ACR_PULL_USERNAME` / `ACR_PULL_PASSWORD` | 生产拉取身份，仅授权相应仓库拉取 |
| `PROD_ENV_FILE` | **File 类型**，当前业务生产 dotenv 内容，禁用变量展开 |
| `SSH_PRIVATE_KEY` / `SSH_KNOWN_HOSTS` | **File 类型**，专用私钥和提前核对的主机指纹 |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_ROOT` | VPC 地址、部署账号、专用绝对目录，例如 `/srv/rapidkit-release` |
| `DEPLOY_PORT` / `DEPLOY_PYTHON` | 可选，SSH 端口 22、目标 Python 命令 python3 |
| `PRODUCTION_URL` | GitLab 环境页面 URL；实际验证入口在 profile 的 public_url 中配置 |
| `OSS_ENDPOINT` / `OSS_REGION` / `OSS_BUCKET` | HTTPS Endpoint、地域、Bucket |
| `OSS_PREFIX` | 可选，默认为 `rapidkit/production/predeploy` |
| `OSS_AUTH_MODE` | 推荐 `Ali-EcsRamRole`，使用生产 ECS RAM 角色；也支持显式 `AK` |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 仅 AK 模式需要，使用专用受限 RAM 身份 |

SSH 私钥含换行，GitLab 可能不允许 Masked：使用受保护文件变量，末尾保留换行，不打印内容。构建任务不得获得生产配置、SSH、OSS 凭据。为 profile 中的目标环境凭据配置 `production` scope；不要使用调试追踪输出所有环境变量。

RAM 授权只覆盖备份前缀的 PutObject、GetObject、列举及所需分片操作；本示例不主动删除 OSS 对象，生命周期由管理员配置。启用 KMS 时另行授予所选 KMS key 的必要权限。ACR 的账号/密码是实际仓库访问凭据，不混用 GitLab Registry 凭据或将普通 AccessKey 直接当作 Docker 密码。

## 配置文件

`PROD_ENV_FILE` 以现有 `docker/prod/.env.example` 为基础填写。不是 shell 脚本，不使用 `source`。包含 `$` 的字面值使用 Compose 单引号，例如 `POSTGRESQL_PASSWORD='a$b'`；JSON 数组按 dotenv 规则书写，PEM 使用双引号及转义 `\n`。禁用 GitLab 变量展开。

示例将同一个配置文件用于 `--env-file` 与服务 `env_file`，清理继承环境对插值的覆盖。运行身份、库名/密码、Redis 队列位置、现有认证密钥变更需要单独维护，不能假装是普通新增配置。必填项及插件配置会在维护前通过候选镜像检查。

ACR、SSH 和 OSS 凭据独立于业务 `.env`，不会注入应用容器。SSH 示例只传输目标钩子需要的凭据，不传输 SSH 私钥。目标目录 0700，配置及凭据文件 0600；旧版本配置保留用于恢复，备份中不包含业务 `.env`。

## 首次接入已有生产

先在隔离环境演练备份下载与恢复，准备 SSH/RAM 权限，并核对项目名、服务名、实际端口和当前 `.env`。首次导入使用**当前线上配置**，不要提前放入尚未支持的新配置。

将本次代码放到生产服务器的受信目录，在服务器执行一次：

```bash
python3 /path/to/repo/deploy/examples/aliyun/adopt.py \
  --source-root /path/to/repo \
  --profile /path/to/repo/deploy/examples/aliyun/profile.json \
  --env-file /path/to/current/.env.prod \
  --root /srv/rapidkit-release \
  --release-id baseline-20261027
```

该操作记录实际运行镜像、命令、Worker 数量及已有配置，并重建 **Nginx 单个服务**以安装持久维护开关。API/Worker/Beat 和数据库不升级。它不是纯读取操作，应在接入准备时执行。示例不会创建数据库、覆盖数据卷或初始化业务数据。

确认 baseline 状态成功，再创建正式 tag。切勿对同一环境重新执行 adopt 或手动覆盖 `current.json`。

## 日常发布

1. 提交并合并代码及迁移文件，补齐 GitLab 新增必填配置。
2. 创建受保护版本 tag，例如 `v1.2.3`。
3. 检查、测试和迁移验证通过后自动构建两个镜像并推送 ACR，记录 digest。
4. 点击 `production` 手动任务。重试使用同一镜像，生成新的发布尝试 ID，不重新构建。
5. 目标完成预检、维护停写、备份及 OSS 往返校验、迁移、启动验证后恢复访问。

GitLab 中配置 Prevent outdated deployment jobs；生产任务的 resource_group 和目标锁都覆盖发布全过程。不自动重试或取消生产任务。Runner 中断后目标进程可继续，先查询目标状态，不能重复点击发布来覆盖未完成记录。

接入后旧 `deploy-backend.py` 会识别受管理容器并拒绝绕过发布入口；容量和配置更新也通过显式选择的发布流程处理。未接入 CD 的环境仍可使用旧脚本，`--workers-only` 可跳过迁移及 API/Beat 更新。

普通发布仅操作 API、Worker、Beat、Nginx，启动统一使用 `--no-deps --no-build --pull never`。PostgreSQL/Redis/MinIO 保持运行。迁移明确执行一次 `alembic upgrade heads`，后续启动不会通过 depends_on 再运行它。不执行 `down -v`、清空任务队列或生产 seed。

Worker 实例每次启动唯一，组和目标容量稳定；Worker 发布代次由发布 ID 稳定派生为 32 位标识，记录在 state.results.runtime.start.worker_deployment 中，避免长流水线 ID 超过后端字段限制。退役仅在新实例与 Beat 就绪后完成。任务消息和数据库迁移仍须兼容历史数据及旧任务，脚本不能自动证明业务代码兼容性。

## 备份和恢复

每次发布停写后执行同主版本 PostgreSQL `pg_dump -Fc`，另存 globals（不保存角色密码）。备份带有 revisions、服务器版本、源/目标版本信息和 SHA-256。先传输数据与元数据，下载重新计算校验值，最后上传 `_COMPLETE` 标记。Multipart ETag 不当作 MD5。

仅能从备份恢复到备份时刻。本次未提供日常备份、WAL 归档或时间点恢复，也不备份 Redis 队列与 MinIO 文件。OSS 完成标记成功后，本地保留当前及最近一份已确认备份；失败或未确认的备份不会自动清理。

SSH 返回的发布 ID 对应目标目录：

```bash
python3 /srv/rapidkit-release/incoming/ID/deploy/release.py status \
  --root /srv/rapidkit-release --bundle /srv/rapidkit-release/incoming/ID
python3 /srv/rapidkit-release/incoming/ID/deploy/release.py recover \
  --root /srv/rapidkit-release --bundle /srv/rapidkit-release/incoming/ID
```

迁移前失败会尝试恢复旧版；Worker 仍未退出则继续维护。迁移开始后失败保留维护，显式 recover 会检查实际 revisions；只有迁移明确成功且 revisions 与备份时完全相同（没有结构升级）才允许恢复旧应用。迁移失败或中断时，即使 revisions 未变，也可能存在部分变更，因此不会据此直接恢复。schema 已变化时，先修复迁移/发布，或评估兼容性并编写该次专用恢复步骤。不要自动 `alembic downgrade`。

需要发布修复版本时，在新版本的手动生产任务中显式提供 `RELEASE_REPAIR_FROM=<失败的发布尝试ID>`。入口会调用 `dispatch --repair-from`：先取得目标锁，确认没有迁移容器仍运行、停写且维护已开启，再交接状态并重新备份。原发布记录保留，新的修复尝试仍受备份、迁移和就绪门禁保护。未完成的 baseline 导入必须先恢复，不能走修复发布。

修复发布不会把“当前备份 revisions 未变”直接当作兼容上一个成功应用的证据；恢复还要比对最后成功版本的 revisions。若失败导致 API/Nginx 容器元数据缺失，先在维护下修复入口和确认已有配置身份，再继续；脚本不会猜测数据库地址或伪造旧版信息。

从 OSS 下载使用 storage 的 `get` 动作，输入 results.storage.put.reference 指向所需备份前缀；它检查完成标记、下载并校验文件，返回隔离工作目录，不执行 SQL。恢复演练应在新建的隔离 PostgreSQL 中运行 `pg_restore --exit-on-error`，核对关键表及 revisions，再单独决定切换；globals 中已有角色可能与新集群默认角色重复，需要审查。角色密码从受限配置重新设置。

不要在业务已恢复写入后自动覆盖生产库。人工灾难恢复还须评估 Redis 待处理任务和 MinIO 文件与数据库时刻的一致性。

## 验收边界

本地契约测试、隔离 PostgreSQL 恢复及 Nginx 维护测试可在无云凭据时执行。首次生产使用前还需实际验证：受保护 tag/变量、Runner 构建权限、ACR 推拉、SSH 断连后目标状态、OSS 上传下载及生命周期、真实业务维护与恢复时长。

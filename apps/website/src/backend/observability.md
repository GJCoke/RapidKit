# 生产可观测性与故障处置

适用于 Docker Compose 生产部署，默认 INFO 即可使用。请求与凭证策略见[日志系统](./logging)，观测流恢复见[任务队列](./celery#观测事件恢复与运维)。本文的阈值是初始值，需要根据真实流量和磁盘容量调整；仓库配置与本地演练不等于生产平台已接入。

## 部署边界

| 数据 | 所在位置与所有者 | 生命周期 |
| --- | --- | --- |
| API/Worker/Beat/迁移运行文件 | 宿主机 `RAPIDKIT_LOG_ROOT` 下 api/worker/beat/migrate，每个角色共享目录 | 7 天，单角色默认 5 GiB 普通日志预算 |
| stdout/stderr，包括 Nginx | Docker json-file | 每容器 20m × 5，非阻塞缓冲 1m |
| 进程数值快照 | 各容器 `/tmp/rapidkit-runtime` | 容器启动清空，5 秒心跳；不依赖 Redis 或文件日志目录 |
| HTTP/进程指标 | 每个 API `:8006/metrics`、Worker/Beat `:9008/metrics` | Prometheus 逐实例抓取 |
| 全局依赖、队列、容量、日志目录指标 | 单例 observability `:9009/metrics` | 每 10 秒采样，不随 API 副本重复计算 |
| 任务执行详情 | PostgreSQL Worker 表 | 默认不清理；显式启用后按保留天数清理，每小时最多 1000 条 |
| 幂等凭据、审计记录、隔离流 | PostgreSQL/Redis | 本批次不自动删除 |

四个角色的应用预算合计初始为 20 GiB，不包含 Docker stdout、数据库、指标库及备份。预算在 Linux/POSIX 上以目录锁协调同角色多进程写入，超限、剩余空间不足或不可写时丢弃普通文件记录并独立报告，业务调用继续执行。其它平台保留未启用预算的原默认日志方式。它不是文件系统配额，不能约束其它程序或 Docker 卷。上线应另行分配独立磁盘或项目配额，预留数据库、Prometheus 和 Docker 空间。Prometheus 示例按时间保留 15 天，也需要评估容量。

选择 stdout 或文件中的一种作为应用日志集中采集源，避免重复入库。若选文件，仍单独采集 Docker stderr 退化标记及 Nginx/基础设施日志。节点磁盘与 inode 指标、采样失效告警必须保留。审计队列采用独立可靠性策略，普通文件丢弃不代表审计已入库。

## 首次接入与升级

1. 备份数据库和当前容器日志，核对实际配置的 `LOG_PATH`。旧容器内的文件不会自动进入新挂载：先停止对应写入进程，在**移除或重建容器前**从旧路径复制至对应角色目录，核实内容后再继续。不要把复制活跃文件当作完整备份。旧版本未被宿主机登记的实例文件只会保留，需人工核实后归档。
2. 镜像固定保留原生产镜像的 UID/GID **999:999**。按部署位置调整下列路径，先准备目录；已有目录所有权不匹配时命令报错，应检查后单独修复，程序不会递归 chown 历史文件。

```bash
sudo python3 deploy/observability.py prepare \
  --log-root /var/lib/rapidkit/logs \
  --state-root /var/lib/rapidkit/observability --uid 999 --gid 999
```

3. 在 `docker/prod/.env.prod` 设置匹配的 `RAPIDKIT_LOG_ROOT`、`RAPIDKIT_OBSERVABILITY_ROOT`。Compose 明确使用 `/app/logs`，缺少挂载源即失败。先审查并升级 Worker 增量迁移 `508976be24b7`，再启动本批次镜像；生产迁移由项目部署流程执行。不要为回滚删除 receipt 表。

   仓库当前只有 Worker 的公开基线及增量，缺少其它插件历史迁移；全新空库不能仅靠 `alembic upgrade heads` 得到完整应用表。已有部署必须先核对真实 revision/schema 与私有迁移链，衔接正确 predecessor；禁止盲目 stamp 或对已有表直接执行建表基线。此项是既有部署门槛，本批次不重建未知历史迁移。
4. 安装 `docker/observability/rapidkit-observability.service` 的宿主机服务示例；将 `/opt/rapidkit`、日志路径、项目名与网络名改成实际值。服务运行 `deploy/observability.py watch --apply`，每 10 秒更新 inventory 与 Prometheus file_sd，并维护已移除实例日志。该服务需要宿主机 Docker 权限，应用、Prometheus、Alertmanager 均不挂载 Docker socket。

```bash
# 可先手工检查发现与清理候选；cleanup 默认仅统计。
sudo python3 deploy/observability.py refresh
sudo python3 deploy/observability.py cleanup
```

清理仅处理已登记、默认 Docker hostname 与完整容器 ID 匹配、**已移除**且文件超过 7 天的普通日志。仅停止但仍存在的容器可能恢复，文件受保护。活跃实例、未知实例、符号链接均受保护；Docker 查询失败不执行删除。实例重建后宿主机服务负责旧 hostname 文件回收，应用进程负责本机轮转归档。长期停止但未移除的实例需要人工归档或移除，以免长期占用预算。

5. 平台可选使用已有服务，或在同一 Compose 网络启用仓库示例。先在主机创建仅含**兼容 Alertmanager 通用 webhook 协议**接收 URL 的私有文件；非兼容平台需要适配器。文件须对 Alertmanager 容器用户可读，并限制宿主机访问；不要将密钥放入 Git 或终端输出。将其绝对路径设为 `ALERT_WEBHOOK_URL_FILE`：

```bash
docker compose --env-file docker/prod/.env.prod \
  -f docker/prod/docker-compose.yml -f docker/observability/compose.yml config --quiet
docker compose --env-file docker/prod/.env.prod \
  -f docker/prod/docker-compose.yml -f docker/observability/compose.yml up -d
```

示例不发布任何监控宿主机端口。已有 Prometheus 若不在 Compose 网络内，应经受控内网接入或由本地采集器转发，不能把内部容器地址直接当公网目标；逐副本抓取，不能抓 Nginx 负载均衡地址。自定义服务名需同步宿主机发现映射；目前默认识别 backend-api、celery-worker、celery-beat、backend-migrate。

6. Sentry 设置 `SENTRY_DSN`、`ENVIRONMENT=PRODUCTION`、`SENTRY_RELEASE`，所有角色使用同一不可变发布标识。未显式设置 release 时使用 `APP_VERSION`；建议部署注入提交或构建标签，避免不同构建共用默认版本。保持请求正文、默认 PII、局部变量与性能采样关闭，先在测试环境验证安全错误事件与 release 归属。

## 指标与告警语义

每个容器聚合当前容器所有进程的数值快照。退出子进程计数在本次容器生命周期内保留，当前 gauge 只统计活跃进程；重建容器计数归零。进程快照超过 20 秒或不可读触发独立告警。标签仅使用角色、固定组件、路由模板等有限维度，不含用户、任务、请求 ID。

全局采样器只部署一个，固定 singleton 容器名称阻止误扩容。每个组件分别输出 `rapidkit_ops_sample_success` 与上次成功时间。队列采样失败保留上次观测值，同时标记未知；旧失败值不会因 Redis 断连变成零并发出虚假恢复。首次无法采样时没有队列值，依赖与采样失败告警负责覆盖。健康零值必须同时满足采样成功和新鲜。网络/SQL 探测超时、内部任务退出、Worker 发布失败不只依赖业务日志判断。

| 触发条件 | 初始规则 |
| --- | --- |
| API 全部不可达、Redis/PostgreSQL 探测失败 | 持续 1 分钟 critical |
| server/transport 错误率 >1% | 5 分钟窗口至少 100 请求，再持续 5 分钟；业务拒绝不计入 |
| 路由 P95 >3 秒 | 同窗口至少 100 请求，持续 10 分钟 warning |
| pending 最老 >120 秒且增长 | 持续 1 分钟；失去采样时保留已知失败 |
| 隔离记录、发布失败、事件缺口、审计 fallback | warning 或 critical；调查确认后处置证据 |
| Worker 期望容量不足、后台任务停止 | 容量持续 2 分钟，组件持续 1 分钟 |
| 日志预算 >90%、文件丢弃、磁盘余量 <20%/<10%、inode <10% | 预算 warning；丢弃与低空间 critical |
| 采样器、发现、抓取、通知失败 | 独立 critical，避免监控自身失效被当健康 |

Alertmanager 按 alertname/service/component/instance 分组，10 秒等待、1 分钟分组间隔、12 小时重复。severity 不在分组键中，升级会更新同组；发送 resolved。告警标签的 owner 为 `rapidkit-operations`，部署时必须映射实际值班人与通知渠道。低流量错误率/延迟规则不会触发，应结合个例日志与 Sentry 判断。

## 故障处置

### API 不可用 {#api-unavailable}

确认发现时间与各实例 `up`，从内部检查 `/health/live`、`/health/ready` 及最近发布。区分进程退出、依赖故障和发现故障。先保留完成日志、edge/request ID 与容器退出证据，恢复一个健康实例再评估回滚，恢复后确认所有目标和 readiness。

### 依赖不可用 {#dependency-down}

按 component 分辨 Redis/PostgreSQL，确认独立探测与网络、服务状态、磁盘。Redis 中断时 Worker 发布失败计数仍可抓取，说明可能已有观测缺口，不能将依赖恢复等同于历史完整。DB 恢复后观察 pending 消退及审计提交，不清空队列“恢复健康”。

### 服务错误 {#api-errors}

按发布、路由模板和时间关联 Sentry、`http.request.completed`，关注 server/transport 与实际 HTTP 状态。检查是否响应后异常；保留 request_id、correlation_id，禁止临时输出正文、token 或 DSN。修复或回滚后观察完整窗口，确认错误率与个例恢复。

### 慢路由 {#slow-route}

查看慢请求 WARNING 的 duration/header_duration 与路由，排查 SQL、队列、依赖资源及部署变化。当前没有全链路依赖 tracing，不能仅凭 HTTP P95 定位具体 SQL；必要时单独制定受控诊断方案。

### 事件积压 {#event-backlog}

检查 sample_success/时间、pending 最老年龄、lag、消费组件与 DB；用 B 批次 status 操作核对 group watermark。恢复依赖后观察 XACK 推进，避免通过任意 XTRIM、删除 group 或在线重发任务解决积压。

### 事件隔离 {#event-isolation}

按固定 reason_code 检查隔离事件的安全元数据。按照[观测事件恢复流程](./celery#观测事件恢复与运维)修复格式或时间后单独决定是否回放。恢复命令只追加观测事件，不执行业务任务；未归档隔离证据会阻止相关任务详情清理。

### 发布缺口 {#publication-gap}

从 Worker 独立指标判断发布失败、gaps 的发生窗口，对照 Redis/Worker 运行状态。没有可靠源数据时不能补造成功事件。恢复发布后计数保留历史，使用 increase 与事件时间区分新故障，调查相应业务结果和审计是否需要核对。

### 审计本地回退 {#audit-fallback}

检查 fallback gauge、入队计数和 audit_delivery 状态，优先恢复 Redis/DB，使内存回退排空。保留相关实例，避免立即重建导致尚未持久化的回退丢失。确认 Redis processing 与最终审计入库，不凭业务响应成功认定审计完整。

### 审计积压 {#audit-backlog}

检查 pending/processing、消费者和数据库写入失败。恢复消费者并观察两者及提交进度，不删除审计数据。积压阈值 1000 需按真实吞吐调优；采样失效时保留旧值并处理独立采样告警。

### Worker 容量 {#worker-capacity}

核对部署脚本登记的 expected_replicas、组部署代次和 grace。unknown 表示尚未登记容量，不表示缺少零个；通过现有部署流程设置预期并确认活跃实例与队列。保留旧组历史，不能手改行数伪造恢复。

### 后台组件停止 {#background-component}

按有限 component 标签查看对应容器退化日志与 running/expected，检查 task_event_consumer、worker_offline_checker、audit_delivery 等任务退出原因。先修依赖与代码，再受控重启；确认任务重新运行、退化恢复和积压处理。

### 日志与磁盘容量 {#log-capacity}

区分角色预算、只读/权限、文件系统空间或 inode。核对挂载与 999:999 权限，观察 `rapidkit_file_log_dropped_total`、`rapidkit_log_blocked` 及独立 stderr 标记。预算达到上限时停止普通文件写入，stdout 仍受 Docker 轮转管理；不要关闭告警来消除丢失证据。

先 `cleanup` dry-run，只清理确认已移除实例且超过保存期的文件；未知/仍存在实例人工检查。不要删除活跃文件、审计表、数据库卷或 Docker daemon 私有日志。确认空间需求后扩容/调整配额，恢复写入并确认 recovered 与不再新增 dropped。磁盘填满或整个宿主机故障可能同时使本机监控失效，需要外部监控与异机采集；本机栈不能自证宿主机断电可告警。

### 采样器或快照失效 {#sampler-stale}

先检查相应 `up`、ops 心跳、每组件成功时间和 runtime 快照年龄。区分依赖失败、角色目录读取失败与采样器退出；保留最后数值，未知不按健康处理。修复采样进程后确认心跳与所有必要组件恢复，不能只看 `/metrics` 返回 200。

### 发现失效 {#discovery-stale}

检查宿主机服务、Docker 可达性、项目与网络名及 inventory 更新时刻。发现文件包含实例地址，不含环境密钥。修复后核对每个当前 API/Worker/Beat 都有直接目标、旧地址已移除；不要用清空 targets 掩盖失败。

### 抓取目标失效 {#target-down}

核对目标是否已被移除、容器是否仍运行及私网端口是否可达。Worker `:9008` 与 Redis 独立；应用正常但指标不可达也需修复。比较发现时间与实际容器，排除旧 IP 后确认新实例快照新鲜。

### 通知失效 {#notification-failure}

检查 Alertmanager 的 `up`、发送失败计数、接收端协议和网络，核对私有 URL 文件权限而不打印内容。同一 Alertmanager 故障时，它不能通过自身送出该告警，必须由已有平台或外部 watchdog 监测 Prometheus/Alertmanager。生产验收要验证实际值班渠道收到 firing、升级、抑制重复和 resolved。

### 演练 {#exercise}

在隔离环境用合成数据运行 `apps/backend/tests/test_operational_docker.py`（pytest `docker` 标记，镜像 `rapidkit-backend:observability-c`）。它创建独立 Compose 项目、真实 Prometheus/Alertmanager 与本地 webhook，演练副本发现、重建日志、角色预算、只读目录、Redis/PostgreSQL 故障恢复及通知去重/升级/恢复；测试端口仅绑定 loopback，结束删除测试容器与卷。为隔离验证本批次，测试在合成空库中额外通过模型补建缺失的其它插件表，不能据此认定完整历史迁移链已恢复。结果在 `logs/verification/`，不包含真实渠道验证。本机测试不替代生产迁移、配额、保留窗口、接收人和整机故障验收。

## 任务详情清理与回滚

默认 `TASK_RESULT_RETENTION_DAYS` 未设置，不进行自动清理。需要启用时先备份，确认迁移及所有消费者都支持 `TaskReceipt`，先运行 dry-run：

```bash
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml \
  exec backend-api python -m plugin_worker.retention --days 30
```

确认策略后才显式运行 `--apply` 或设置 `TASK_RESULT_RETENTION_DAYS=30` 并重建单例 observability。清理仅限超过期限的终态，跳过 pending、未读和隔离流引用；未知 group、未知 schema、Redis 错误或扫描超过 10000 条时暂停。每次最多 1000 条，自动每小时一次；大表执行成本与窗口需先评估，不保证立即降到保留期内。

每条清理与最小幂等凭据写入使用同一数据库事务、同一任务锁。旧 attempt 的迟到事件不会重建结果、重复计数或审计；更高 attempt 可以形成新执行。凭据只保存任务标识、attempt 与基础元数据，无 args、返回值或诊断载荷，当前不自动过期。它们不替代业务幂等。

停用自动清理可撤销配置，但已删除详情不会自动恢复。**一旦发生清理，不可回滚到不识别凭据的 B 或更早消费者**；应保留支持凭据的回滚镜像和 receipt 表，恢复详情须制定备份恢复方案。仅在尚未清理且验证 receipt 为空时，才可评估迁移回退。其它应用回滚保留宿主机挂载及 999:999 身份；不要用删除日志目录、队列、表或卷来回滚。

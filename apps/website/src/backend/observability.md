# 生产可观测性与故障处置

适用于 Docker Compose 生产部署，默认 INFO 即可使用。请求与凭证策略见[日志系统](./logging)，观测流恢复见[任务队列](./celery#观测事件恢复与运维)。本文的阈值是初始值，需要根据真实流量和磁盘容量调整；仓库配置与本地演练不等于生产平台已接入。

## 部署边界

| 数据                               | 所在位置与所有者                                                        | 生命周期                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| API/Worker/Beat/迁移运行文件       | 宿主机 `RAPIDKIT_LOG_ROOT` 下 api/worker/beat/migrate，每个角色共享目录 | 7 天，单角色默认 5 GiB 普通日志预算                      |
| stdout/stderr，包括 Nginx          | Docker json-file                                                        | 每容器 20m × 5，非阻塞缓冲 1m                            |
| 进程数值快照                       | 各容器 `/tmp/rapidkit-runtime`                                          | 容器启动清空，5 秒心跳；不依赖 Redis 或文件日志目录      |
| HTTP/进程指标                      | 每个 API `:8006/metrics`、Worker/Beat `:9008/metrics`                   | Prometheus 逐实例抓取                                    |
| 全局依赖、队列、容量、日志目录指标 | 单例 observability `:9009/metrics`                                      | 每 10 秒采样，不随 API 副本重复计算                      |
| 任务执行详情                       | PostgreSQL Worker 表                                                    | 默认不清理；显式启用后按保留天数清理，每小时最多 1000 条 |
| 幂等凭据、审计记录、隔离流         | PostgreSQL/Redis                                                        | 本批次不自动删除                                         |

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

| 触发条件                                                | 初始规则                                               |
| ------------------------------------------------------- | ------------------------------------------------------ |
| API 全部不可达、Redis/PostgreSQL 探测失败               | 持续 1 分钟 critical                                   |
| server/transport 错误率 >1%                             | 5 分钟窗口至少 100 请求，再持续 5 分钟；业务拒绝不计入 |
| 路由 P95 >3 秒                                          | 同窗口至少 100 请求，持续 10 分钟 warning              |
| pending 最老 >120 秒，不要求数量增长                    | 持续 1 分钟；失去采样时保留已知失败                    |
| 未读事件 lag >1000                                      | 持续 1 分钟 warning；阈值需按真实吞吐调优              |
| Redis 请求指标丢弃                                      | warning；计数增加或首次快照已非零时可见                |
| Redis used_memory/maxmemory >85%                        | 持续5分钟 warning；maxmemory为0另持续10分钟 warning    |
| Redis evicted_keys 增加                                 | 立即 critical；包括发现目标时首次快照非零              |
| 已ACK历史超过7天+300秒、流长度>1且pending/lag均为0      | 持续5分钟 warning，检查裁剪能力                        |
| 隔离记录、发布失败、事件缺口、审计 fallback             | warning 或 critical；调查确认后处置证据                |
| Worker 期望容量不足、后台任务停止                       | 容量持续 2 分钟，组件持续 1 分钟                       |
| 日志预算 >90%、文件丢弃、磁盘余量 <20%/<10%、inode <10% | 预算 warning；丢弃与低空间 critical                    |
| 采样器、发现、抓取、通知失败                            | 独立 critical，避免监控自身失效被当健康                |

Alertmanager 按 alertname/service/component/instance 分组，10 秒等待、1 分钟分组间隔、12 小时重复。severity 不在分组键中，升级会更新同组；发送 resolved。告警标签的 owner 为 `rapidkit-operations`，部署时必须映射实际值班人与通知渠道。低流量错误率/延迟规则不会触发，应结合个例日志与 Sentry 判断。

## 故障处置

### API 不可用 {#api-unavailable}

确认发现时间与各实例 `up`，从内部检查 `/health/live`、`/health/ready` 及最近发布。区分进程退出、依赖故障和发现故障。先保留完成日志、edge/request ID 与容器退出证据，恢复一个健康实例再评估回滚，恢复后确认所有目标和 readiness。

### 依赖不可用 {#dependency-down}

按 component 分辨 Redis/PostgreSQL，确认独立探测与网络、服务状态、磁盘。Redis 中断时 Worker 发布失败计数仍可抓取，说明可能已有观测缺口，不能将依赖恢复等同于历史完整。DB 恢复后观察 pending 消退及审计提交，不清空队列“恢复健康”。

### 服务错误 {#api-errors}

按发布、路由模板和时间关联 Sentry、`http.request.completed`，关注 server/transport 与实际 HTTP 状态。检查是否响应后异常；保留 request_id、correlation_id，禁止临时输出正文、token 或 DSN。修复或回滚后观察完整窗口，确认错误率与个例恢复。

### 慢路由 {#slow-route}

查看慢请求 WARNING 的 duration/header_duration 与路由，排查 SQL、队列、依赖资源及部署变化。结合下文依赖操作直方图与同 request_id 的慢/失败事件，先区分连接池获取、SQL 和外部调用。当前没有全链路 tracing，也不记录 SQL 原文；不能仅凭 HTTP P95 定位具体 SQL。

### 事件积压 {#event-backlog}

检查 sample_success/时间、pending 最老年龄、lag、消费组件与 DB。pending 数量固定也可能持续老化；旧告警名 `RapidKitPendingGrowing` 保留以兼容路由，已不要求数量增长。未读 lag 超过1000持续1分钟单独告警，pending为0也适用。1000是初值，低吞吐关键队列应按实际延迟要求降低阈值；用 B 批次 status 操作核对 group watermark。恢复依赖后观察 XACK 推进，避免通过任意 XTRIM、删除 group 或在线重发任务解决积压。

### 事件隔离 {#event-isolation}

按固定 reason_code 检查隔离事件的安全元数据。按照[观测事件恢复流程](./celery#观测事件恢复与运维)修复格式或时间后单独决定是否回放。恢复命令只追加观测事件，不执行业务任务；未归档隔离证据会阻止相关任务详情清理。

### Stream保留与维护 {#stream-retention}

全局采样新增 `rapidkit_events_length`、`rapidkit_events_memory_bytes`、`rapidkit_events_oldest_age_seconds`。前两者是主流的长度和Redis估算内存，不包含dead/审计/业务key；年龄取Redis源ID时间，不取可延迟或被修正的生产者timestamp。7天是最短保护窗口，不是长度或内存上限。

唯一 observability 采样器每轮最多执行10次现有安全裁剪，每次最多1000条，共用 `stream_trim` 组件5秒总时限；本轮完成后整个采样器等待10秒再运行。理想上限约1000条/秒，实际还受网络、采样耗时和保护水位限制，不能按API副本数放大。原子脚本继续保护7天、所有已登记组的pending和未读水位，不加MAXLEN。未知/缺失组或新组未初始化时拒绝维护，`rapidkit_ops_sample_success{component="stream_trim"}`为0并触发现有采样失败告警；采样器退出由独立失效告警覆盖。

`rapidkit_events_trim_removed_total`是采样器生命周期内的删除计数；`rapidkit_events_trim_last_run_timestamp_seconds`为上次完成维护轮的时间，`rapidkit_events_trim_last_removed_timestamp_seconds`为上次实际删除时间，尚未删除时为0。空闲流不删除属于正常情况；按年龄、长度、pending/lag和成功时间一起判断。采样器重启会重置累计值，使用rate/increase而非直接相减。失败保留上次值并标为未知，不能把旧时间视作当前进展。

`RapidKitStreamRetentionBehind`只覆盖pending/lag均为0但已ACK历史仍超期的场景。固定水位保留最后一条时不告警；有pending或未读时使用既有积压规则。修复采样权限或恢复维护后，应看到删除计数推进及超期历史消退。不要删除group、pending或dead来制造恢复。

### Redis内存与AOF容量 {#redis-capacity}

采样器需要现有Stream命令、`MEMORY USAGE`和`INFO memory/stats/persistence`权限。INFO失败使 `redis_capacity` 组件未知并告警；独立 `redis` 组件仍按PING判定连通性，避免把容量ACL缺失误报为Redis宕机。MEMORY权限失败使 `events` 采样未知。不能把采样器HTTP200当作已采集。新增 `rapidkit_redis_used_memory_bytes`、`rapidkit_redis_used_memory_rss_bytes`、`rapidkit_redis_maxmemory_bytes`、`rapidkit_redis_evicted_keys_total`、`rapidkit_redis_aof_enabled`、`rapidkit_redis_aof_current_size_bytes`。INFO统计是整个Redis实例的数据；Stream memory_bytes只估算单个key，不应直接相减得出业务内存。

used_memory/maxmemory超过85%持续5分钟告警。maxmemory为0表示未配置Redis上限，另持续10分钟告警；它不是0字节容量。evicted_keys新增立即critical，首个采样值已非零时也会提醒，需区分历史驱逐与新驱逐；停止新增不表示丢失数据已恢复。`noeviction`下内存耗尽表现为写入拒绝，不会增加驱逐计数，应同时查看发布失败、依赖错误和采样有效性。Redis上限不覆盖全部RSS、复制缓冲、fork写时复制及AOF磁盘，宿主机内存/磁盘告警不可省略。

上线前按实际峰值事件速率估算：`7天主流内存 ≈ 事件/秒 × 604800 × 实测每条字节`。每任务通常产生多个生命周期事件，不能拿任务/秒代替事件/秒。在相近payload与group/PEL规模下测量MEMORY USAGE增量；另计dead、业务/审计key、碎片、复制、维护中断及峰值余量。AOF不能按当前内存简单换算，需测真实append/rewrite增长及重写临时磁盘。记录maxmemory、驱逐策略、宿主机额度、AOF/备份磁盘和允许中断窗口，再据此确定负载范围与告警阈值。

dead没有自动到期。由运维/后端负责人对每次积压建处置记录，明确原因、安全归档位置、回放/保留结论和截止日期；核对归档可读及源编号后，单独批准处理具体记录。本轮不提供自动删除，也不把人工归档要求视作已有归档系统。真实环境必须指定具体负责人、保存期和容量预算；未完成时上线清单保持待验。

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

文件通道还可能因 `lock_busy`、`queue_full`、`record_too_large` 或 `shutdown_timeout` 退化。API、Worker、Beat 每进程采用 256 条/1 MiB 有界投递，包含正在写的记录；多进程的总量随进程数增加。查看 `rapidkit_file_log_queue_records`、`rapidkit_file_log_queue_bytes`（仅存活进程求和）以及 `rapidkit_dependency_duration_seconds{component="log_file",operation="write"}` 判断队列和真实文件写入耗时；被锁拒绝的写入记 error。正在卡住的写入尚未形成耗时样本，应同时看队列、dropped、角色新鲜度及外部磁盘指标。

`rapidkit_file_log_dropped_total` 包含文件投递拒绝、写入失败及停机期限内未确认记录，不能等同于精确丢失的业务请求数；未确认的记录之后可能写入。独立 stderr 的 degraded/recovered 与现有日志退化告警继续适用，恢复不补齐历史缺口。超大记录只拒绝文件副本，stdout 保持原有内容。该策略优先保持在线服务可响应；集中采集和真实通知是否有效仍须真实环境验收。

运行指标按快照采样，进程退出前的尾部增量不保证被抓取；停机超时应同时保留独立 stderr 证据。

先 `cleanup` dry-run，只清理确认已移除实例且超过保存期的文件；未知/仍存在实例人工检查。不要删除活跃文件、审计表、数据库卷或 Docker daemon 私有日志。确认空间需求后扩容/调整配额，恢复写入并确认 recovered 与不再新增 dropped。磁盘填满或整个宿主机故障可能同时使本机监控失效，需要外部监控与异机采集；本机栈不能自证宿主机断电可告警。

### 采样器或快照失效 {#sampler-stale}

先检查相应 `up`、ops 心跳、每组件成功时间和 runtime 快照年龄。

Redis 请求看板指标使用每 API 进程独立的 `request_metrics` 池，最多10连接、10个在途任务。pipeline 总时限为2秒，包含建连、执行和SDK重试等待。达到上限不再创建后台任务；失败、超时和入场丢弃均累计 `rapidkit_request_metrics_dropped_total`，并复用 `request_metrics` 退化/恢复事件。正常关闭先等待这批有时限任务，再清理连接。

这些 Redis 看板指标采用 best-effort 策略。丢弃计数包含入场拒绝、写入失败和超时未确认，不等于精确缺失条数；超时时 Redis 可能已提交。拥塞时 HTTP 响应与 Prometheus 请求计数继续执行，Redis看板会缺记录。`RapidKitRequestMetricsDropped` 会报告丢弃，包括发现目标时首个快照已非零的情况；恢复不代表历史补齐。按峰值负载观察丢弃和业务池容量，再决定是否调整在途上限。

区分依赖失败、角色目录读取失败与采样器退出；保留最后数值，未知不按健康处理。修复采样进程后确认心跳与所有必要组件恢复，不能只看 `/metrics` 返回 200。

### 发现失效 {#discovery-stale}

检查宿主机服务、Docker 可达性、项目与网络名及 inventory 更新时刻。发现文件包含实例地址，不含环境密钥。修复后核对每个当前 API/Worker/Beat 都有直接目标、旧地址已移除；不要用清空 targets 掩盖失败。

### 抓取目标失效 {#target-down}

核对目标是否已被移除、容器是否仍运行及私网端口是否可达。Worker `:9008` 与 Redis 独立；应用正常但指标不可达也需修复。比较发现时间与实际容器，排除旧 IP 后确认新实例快照新鲜。

### 通知失效 {#notification-failure}

检查 Alertmanager 的 `up`、发送失败计数、接收端协议和网络，核对私有 URL 文件权限而不打印内容。同一 Alertmanager 故障时，它不能通过自身送出该告警，必须由已有平台或外部 watchdog 监测 Prometheus/Alertmanager。生产验收要验证实际值班渠道收到 firing、升级、抑制重复和 resolved。

### 演练 {#exercise}

在隔离环境用合成数据运行 `apps/backend/tests/test_operational_docker.py`（pytest `docker` 标记，镜像 `rapidkit-backend:observability-c`）。它创建独立 Compose 项目、真实 Prometheus/Alertmanager 与本地 webhook，演练副本发现、重建日志、角色预算、只读目录、Redis/PostgreSQL 故障恢复及通知去重/升级/恢复；测试端口仅绑定 loopback，结束删除测试容器与卷。为隔离验证本批次，测试在合成空库中额外通过模型补建缺失的其它插件表，不能据此认定完整历史迁移链已恢复。结果在 `logs/verification/`，不包含真实渠道验证。本机测试不替代生产迁移、配额、保留窗口、接收人和整机故障验收。

## 任务详情清理与回滚

默认不设置 `TASK_RESULT_RETENTION_DAYS`，最终配置值为 `None`，不进行自动清理。只接受正整数启用；0、负数或空字符串不是关闭方式。启用后要关闭，应移除环境变量并重建采样器。首次接入时确认 `rapidkit_task_retention_enabled` 为 0。需要启用时先备份，确认迁移及所有消费者都支持 `TaskReceipt`，先运行 dry-run：

```bash
docker compose --env-file docker/prod/.env.prod -f docker/prod/docker-compose.yml \
  exec backend-api python -m plugin_worker.retention --days 30
```

确认策略后才显式运行 `--apply` 或设置 `TASK_RESULT_RETENTION_DAYS=30` 并重建单例 observability。清理仅限超过期限的终态，跳过 pending、未读和隔离流引用；未知 group、未知 schema、Redis 错误或扫描超过 10000 条时暂停。每次最多 1000 条，自动每小时一次；大表执行成本与窗口需先评估，不保证立即降到保留期内。

每条清理与最小幂等凭据写入使用同一数据库事务、同一任务锁。旧 attempt 的迟到事件不会重建结果、重复计数或审计；更高 attempt 可以形成新执行。凭据只保存任务标识、attempt 与基础元数据，无 args、返回值或诊断载荷，当前不自动过期。它们不替代业务幂等。

停用自动清理可撤销配置，但已删除详情不会自动恢复。**一旦发生清理，不可回滚到不识别凭据的 B 或更早消费者**；应保留支持凭据的回滚镜像和 receipt 表，恢复详情须制定备份恢复方案。仅在尚未清理且验证 receipt 为空时，才可评估迁移回退。其它应用回滚保留宿主机挂载及 999:999 身份；不要用删除日志目录、队列、表或卷来回滚。

## 深度定位：依赖、Socket 与浏览器

D 批次不需要数据库迁移，默认 INFO 即可记录下列事件。成功依赖调用只计数，不逐条写 INFO。新增依赖和 Socket 阈值分别为 `DEPENDENCY_SLOW_THRESHOLD_MS=500`、`SLOW_SOCKET_EVENT_THRESHOLD_MS=1000`，单位毫秒，均是待实测调优的初始值。

### 依赖操作

`dependency.slow` 与 `dependency.failed` 使用 WARNING，字段为 component、有限 operation、duration_ms、outcome、retryable、exception_type，继承当前 request_id/任务和身份上下文。不记录异常文本、SQL 或 bind、Redis key/value、对象路径/内容、预签名 URL、邮件地址/正文或连接凭证。`retryable` 是诊断建议，不会自动重试业务；应结合幂等性与原始异常处理决定是否重试。

同类故障或慢操作每进程首次即报，之后每 60 秒最多汇总一条，带累计 `observation_count`；直方图仍逐次记录。摘要的 request/task 编号是当前样本，不能用日志条数估算故障总量。同类操作 60 秒无失败后，下一次成功记录 `dependency.recovered`。持续缺列等错误保持失败状态，不因穿插一条成功 SELECT 就宣布恢复。开发环境默认也不回显 SQL，需要时显式开启 `SQL_ECHO`，生产保持关闭。

| component  | operation 与边界                                                           | 解释                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| postgresql | pool.acquire；query.select/insert/update/delete/other                      | 主异步/同步 Session、TaskSession 和 Beat 引擎均覆盖。pool.acquire 包括池排队及获取/新建连接，不能当作纯排队时间；query 仅测实际游标执行，不含整个事务、结果遍历和应用代码 |
| redis      | get/set/hash/list/set_members/sorted_set/stream/script/pipeline/wait/other | 项目 AsyncRedisClient、其 pipeline 和 Worker 发布用同步客户端。wait 为 BLPOP/XREADGROUP 等主动阻塞等待，成功时不告慢，只计直方图；失败仍告警                              |
| minio      | http.get/head/put/post/delete/other；upload                                | 项目 MinioClient 的 SDK 实际请求及整个 put_object 上传；惰性迭代在发出请求时记录。分片工作线程继承对应上传上下文，并发上传不会混用请求 ID                                 |
| smtp       | send                                                                       | 已配置邮件发送时的连接、TLS、登录和发送整体；未配置邮件服务的跳过行为保持不变                                                                                             |

SDK 内部重试包含在对应边界耗时中；嵌套边界不能直接相加，例如 upload 包含多个 http.put。MinIO 流式下载只测到 SDK 返回响应，不包含调用者后续读完整个对象；只有连接池/SQL/网络边界，不能据此认定业务整体耗时。Celery broker/result、Socket.IO manager 等第三方自行创建的 Redis 客户端没有逐命令覆盖，仍由已有依赖探测与组件退化信号补充。

每个角色的现有 runtime exporter 新增 `rapidkit_dependency_duration_seconds` 直方图，标签只含 service/component/operation/outcome，outcome 为 success/error/cancelled。不含 request_id、用户名或对象等高基数维度；无调用时没有相应序列。快照、fork 重置、容器重建归零与新鲜度判断沿用 C 批次。桶边界为 5/25/100/250/500ms、1/3/10 秒及 +Inf。

例如查看同类操作 5 分钟 P95：

```text
histogram_quantile(0.95,
  sum by (le, service, component, operation) (
    rate(rapidkit_dependency_duration_seconds_bucket{outcome="success",operation!="wait"}[5m])
  )
)
```

先按角色和 component 找出异常，再以 request_id 搜索单次慢/失败事件。pool.acquire 慢而 query 正常时检查连接容量、事务占用和建连；query 慢则检查 DB 负载/锁与发布变化，不能临时把绑定值写进生产日志。失败与取消分开统计；单纯取消不能被视为成功。低流量和采样失效时不要将缺少序列当作健康。

### Socket 关联与恢复

`socket.auth.rejected` 为 WARNING，`socket.connected`/`socket.disconnected` 为 INFO，认证失败和断开原因仅使用固定代码。每个业务事件生成独立 request_id/socket_event_id；`socket_connection_id` 是连接标识，重用同一连接不重用单事件 ID。namespace/event_name 只使用已注册值或 other，不记录握手、token、消息内容和心跳 INFO。

非预期处理器错误写 `socket.event.failed` 并通过已有脱敏 Sentry 边界上报；预期业务异常不送作服务错误，取消继续向外传播。慢成功事件写 `socket.event.slow`。原 ACK、鉴权、撤权和错误传播保持原行为；异常时额外向当前连接发 `diagnostic:error`，仅包含固定 code 和 requestId，Vue 展示通用提示与编号复制。续期循环使用 `socket_renewal` 的退化/恢复事件和已有组件指标，依赖恢复后下一次续期成功才恢复。

排查时从用户提供的单事件 ID 搜索日志，必要时通过连接 ID 检查认证和断开前后事件，再检查同 ID 的依赖耗时。连接断开本身不代表任务失败；Redis 恢复也不能证明续期已成功。

### 浏览器接入与隐私

Vue 和 React 均在应用 bootstrap 前初始化 SDK，只有生产构建同时提供 `VITE_SENTRY_DSN` 与不可变 `VITE_SENTRY_RELEASE` 才启用；Docker 将同一 `SENTRY_RELEASE` 注入浏览器构建。`--mode prod` 上报环境为 PRODUCTION，与 API/Worker/Beat 一致。DSN 是公开配置，上传 token 必须使用服务端密钥入口。修改这些值需要重新构建静态资源。

覆盖全局错误、未处理 Promise、应用 bootstrap、Vue 渲染/路由/chunk、React 根及路由错误边界、意外请求失败。请求只报告网络故障、HTTP 5xx 与框架错误码 7001，预期业务拒绝/取消不按服务错误上报；保持现有刷新登录态、去重与 React chunk 单次恢复行为。页面仅显示通用错误文案和安全编号，不显示堆栈或服务端意外错误原文。请求编号优先取响应 `X-Request-ID`，其次 `X-Edge-Request-ID`，仅接受 21 位 NanoID 或 32 位十六进制值，无有效响应 ID 不伪造一个。渲染错误可使用安全 Sentry event ID。

上报使用最终事件白名单，仅保留 release/environment、固定错误摘要/类别、错误类型、静态 assets 栈位置及 debug ID、application 与合法关联编号。删除页面 URL、query/fragment、请求/响应头和正文、用户信息、表单/存储/DOM、任意错误文本、extras 与 breadcrumbs；关闭 SDK 日志、IP 推断、会话回放及性能采样。传输 fetch 显式不带 Cookie 和 Referer。接收服务仍然会看到连接源 IP、User-Agent 等网络元数据，须在实际 Sentry/入口配置中核对保存策略，客户端关闭 IP 推断不等于网络层匿名化。

严格脱敏会减少错误上下文，定位依赖对应 release 的私有 source map、栈位置和服务端 ID；不能以临时上传表单、Cookie 或 API 正文换取上下文。

### 私有 source map 与 Docker/CI

构建辅助脚本为两个应用注入 debug ID，隐藏 map 在写入公共 bundle 前迁至应用内 `.sentry-artifacts/<vue|react>/<release哈希>/`，目录 700、文件 600，包含 JS/map 与校验清单。该目录 Git/Docker 忽略；公共 dist、最终镜像不包含 map，Nginx 也拒绝 `/assets/*.map`。缺少凭证时本地允许私有归档验证；上传失败仍必须保持公共 map 清除，不能把隐藏 map 直接作为公开 CI 附件。

`.github/workflows/browser-observability-release.yml` 为手工触发的双应用私有上传工作流。配置 secrets `SENTRY_BROWSER_DSN`、`SENTRY_AUTH_TOKEN` 和 vars `SENTRY_ORG`、`SENTRY_BROWSER_PROJECT`，自建实例可配置 `SENTRY_URL`。release 输入必须与实际发布的前后端一致。构建要求上传配置完整，失败阻断工作流，结束清理 runner 私有副本；权限与保存期限由 Sentry 项目管理员核对。工作流只负责构建/上传，实际部署必须使用同次构建的 JS，或重新构建并上传该部署产物对应 debug ID，不能拿别的构建的 map 替代。

Compose 默认关闭浏览器上报；启用时在 `.env.prod` 设置公开 `VITE_SENTRY_DSN`、统一 `SENTRY_RELEASE`、`SENTRY_ORG`、`SENTRY_PROJECT`，以及可选自建 `SENTRY_URL`。`SENTRY_CONNECT_SRC` 只填一个实际 HTTPS 上报 origin，不含 path/账号/分号/空白。启动校验拒绝非法值；CSP 保留同源 WebSocket，跨域 Socket 部署需另行显式配置可信 origin，不能恢复全域 ws:/wss: 放行。loopback HTTP 只供本地演练。

上传 token 保存在 checkout 外的受限文件，设置 `SENTRY_AUTH_TOKEN_FILE` 为绝对路径，使用可选 overlay：

```bash
docker compose --env-file docker/prod/.env.prod \
  -f docker/prod/docker-compose.yml -f docker/prod/docker-compose.sentry.yml config --quiet
docker compose --env-file docker/prod/.env.prod \
  -f docker/prod/docker-compose.yml -f docker/prod/docker-compose.sentry.yml build nginx
```

overlay 通过 BuildKit secret `sentry_auth_token` 注入构建步骤，不使用 token ARG/VITE\_ 变量，不传入运行容器。启用 DSN 的 Docker 构建强制要求完整上传配置；因此仅有 DSN 却无上传权限时构建失败，不能把无法还原的压缩栈算作上线验收。上报 origin 与上传 SENTRY_URL 的用途不同，需要分别验证。生产密钥文件不要放在仓库、镜像、普通 `.env` 或聊天记录中。

### D 批次演练与上线条件

`pnpm test:observability:browser` 使用真实生产构建、Nginx、Chromium 与本机合成 API/上报接收端，需 Docker、已安装 Chromium 及 `rapidkit-backend:observability-d` 测试镜像（可通过 `docker build -f docker/backend/Dockerfile -t rapidkit-backend:observability-d .` 构建；也可用 `OBSERVABILITY_BROWSER_TEST_IMAGE` 指定已有 Python 镜像。仅用其 Python 标准库运行合成 HTTP 服务，不访问生产 DB）。脚本清空远程上传配置，用本地 DSN 验证实际 SDK envelope/请求头脱敏、请求编号复制、全局异常/Promise、bootstrap 失败传播、React chunk 恢复、私有 map 原始栈还原、map 不公开与配置/未配置的 CSP。验证数据与截图写入 `logs/verification/`，测试只清理自己创建的容器/网络；本地私有 map 可按验证保留策略删除。

依赖测试另用隔离 PostgreSQL/Redis 和本地 MinIO/SMTP 协议响应器，覆盖慢 SQL、池耗尽、SQL 取消、阻塞 Redis、并发分片上下文与 SMTP 超时；Socket 使用真实 WebSocket ASGI 连接验证身份隔离、故障与恢复。

当前没有真实 Sentry 项目/上传凭证/通知渠道，已完成的是本地能力验证。上线前仍必须核对实际平台收到安全事件、同次构建 map 上传成功并能还原、CSP/CORS 正反例、release 对齐、接收人和隐私保留策略，以及 C 批次遗留历史迁移链/宿主机容量/告警验收；这些条件不能用本机接收器通过来代替。禁用浏览器上报可清空构建 DSN 并重新构建；降低诊断量可调整慢阈值，日志和指标不能改变业务重试语义。

# 日志系统

项目使用 Loguru 和标准库日志桥接，生产默认输出单行 JSON，同时保留按级别分离、按日期和大小轮转的文件日志。排障依靠 INFO 及以上记录，不要求开启 DEBUG。

## 生产入口与请求记录

运行入口为 `uvicorn src.main:asgi_app`。`src.main.app` 保留 FastAPI 的路由、state 和依赖覆盖接口；`asgi_app` 在整个 FastAPI 应用外观察 ASGI 生命周期，能看到安全拒绝、非法请求 ID、业务失败以及最终异常响应。Docker dev/prod 和本地启动脚本都使用该入口。

每个可正常结束或捕获退出的请求写一条 `event=http.request.completed`。它包含实际发送的 HTTP 状态、业务码、结果分类、请求 ID、身份标量、路由模板和耗时。不会读取、缓存或打印请求/响应正文，也不记录 URL 查询参数。健康检查和指标抓取成功时不逐条刷 INFO。

- `http_status`：实际发出的状态；没有成功发送响应头时为 null。
- `business_code`：响应业务码。HTTP 200 下也可能表示业务失败。
- `outcome`：success/error，与 Prometheus 和 Redis 端点错误统计使用同一分类。
- `error_kind`：固定的 business、validation、authentication、authorization、rate_limited、security_reject、server、transport、cancelled 分类。
- `header_duration_ms`：到响应头成功发送的耗时；`duration_ms`：ASGI 调用总耗时，包含流式处理和响应后处理。
- `response_complete`：观察到最后一个响应 body frame 已成功发送。它不保证业务内容在语义上完整。
- `processing_failed`：处理发生异常或取消。响应发送完成后的后台异常不会被误称为响应未送达。

发生取消或发送失败时保留原异常传播，不发送第二份错误响应。进程被强杀、宿主机断电等无法执行收尾逻辑的场景不能保证有完成记录。

## 请求 ID 和身份

入口生成 21 位 NanoID，或沿用格式合法的 `X-Request-ID`；非法/重复 ID 被拒绝时，响应仍有服务端生成的安全 ID。公共日志字段在记录生成时注入，文件 sink 不依赖控制台 sink 先执行，独立日志级别也能正常记录。

Nginx 使用独立的 32 位 `X-Edge-Request-ID`，不能将该格式冒充为 NanoID。网关访问日志同时保存 edge ID 与应用响应的 request ID；入口直接拒绝的响应也返回 edge ID。

用户、实际操作人和模拟会话取自已认证请求状态的标量快照，不信任客户端自报用户 ID，也不为打日志触发 ORM 延迟加载。请求与任务作用域退出后恢复原上下文，避免并发请求串线。

## JSON 字段

保留既有 `time`、`level`、`message`、`plugin`、`request_id`、`logger`、`exception` 字段；新增 schema_version、environment、release、hostname、pid、service，以及允许列表中的请求、任务和故障字段。任意 `extra` 不会自动进入 JSON。

时间使用带偏移的 ISO 格式；耗时使用单调时钟。JSON 会转义消息中的换行。生产异常只保留异常类型、根因链和代码位置，不保留任意异常值、源码行或局部变量；本地文本诊断可能包含更多信息，分享前需检查。

```python
from rapidkit_core.log import get_plugin_logger

logger = get_plugin_logger("Example")
logger.bind(event="example.completed", user_id=user_id).info("Operation completed")
# 需要异常栈时使用 Loguru 原生接口，不用 logging 的 exc_info=True。
logger.opt(exception=True).warning("Operation failed")
```

标准库日志经 `InterceptHandler` 桥接。Celery trace 消息使用安全生命周期元数据重建，不转发任意任务参数、返回值或错误字符串。已报告的同一 Uvicorn 异常避免重复展开，未报告错误仍保留。

Celery Consumer 的未知任务、未知消息、非法任务和解码错误只输出 `task.message.rejected`，`reason_code` 分别为 unknown_task、unknown_message、invalid_task、decode_error。不插值原 SDK 模板中的 body、headers、delivery_info 或异常值；仅提取长度受限的 task_id/task_name。没有合法编号时记录 null。应用注册的 `SafeConsumer` 保留 Celery 原有拒绝、ACK、失败状态和信号行为。

## 任务诊断与凭证保护

任务的真实参数、返回值和 broker 消息保持业务语义；观测副本默认不保留任意 args、kwargs、返回值和 stdout。任务打印输出被丢弃而不是无限缓存在内存中；安全业务事件请使用项目 logger。事件生产和消费落库都经过白名单，兼容旧事件时也不重新保存凭证。

任务详情及 Worker inspect 不展示原始参数、返回值、stdout 或旧异常文本。详情页面会说明诊断内容被隐藏，管理员可用任务 ID 查运行日志和错误平台。此保护不会删除历史数据库或历史日志中的原值；历史清除、令牌撤销需独立处理。

邀请和密码重置的新链接将 token 放在 URL fragment。前端在路由初始化前提取到内存并清除 URL，校验请求使用 POST JSON；旧 GET 校验与旧 query 链接暂时兼容。清除后刷新页面需重新打开邮件链接。

:::warning
Nginx 的 access_log 和 error_log 是两条不同通道。安全 JSON access_log 不记录 query/Referer，但旧 query 凭证仍可能出现在代理错误日志中。需完成旧邮件有效期与 GET 客户端迁移，不能把 access_log 脱敏误认为所有历史和入口日志都已清理。
:::

Sentry 上报同样去除认证头、请求体、URL query/fragment、局部变量、任意 extra、breadcrumbs 和不可信自由文本，保留异常类型、帧位置及可信 request/user ID。未配置 DSN 时不启用。它不替代全量运行日志和业务审计。

## 文件日志和配置

`setup_logging(service="api")` 配置控制台与标准库桥接，`set_custom_logfile()` 配置文件。Worker 和 Beat 分别标记服务角色，并在 prefork 子进程重新绑定 sink。

在线 API、Worker 和 Beat 的两个文件通道共用每进程一个写线程，投递队列最多 256 条、1 MiB，包含正在写入或等待预算锁的记录。队列只保留已格式化文本和轮转时间，不保留原始参数、异常对象或上下文对象。它替代 Loguru 原生 multiprocessing enqueue，避免其管道填满后阻塞业务线程。共享预算锁由文件写线程等待，短暂竞争不再直接丢弃文件副本，业务线程不等待该锁；写入结束后显式解锁，避免 fork 复制的描述符延长持锁时间。队列满、单条超过 1 MiB、预算不足或文件写失败时，普通文件副本仍会被拒绝并计数，stdout 继续输出原有记录。文件记录不截断；审计持久化不经过此队列。

需要等文件投递结束时调用 `rapidkit_core.log.complete_logging(timeout=1.0)`；返回 false 表示期限内未排空，不能声称落盘完整。`logger.complete()` 不等待应用文件队列。API 正常停机和 Celery 父/子进程关闭已接入该 helper；移除文件处理器最多等待 1 秒，卡住的文件由写线程关闭。强杀、停机超时仍可能丢失尾部。prefork 子进程重新建立自己的队列、线程及带自身 PID 的文件，避免等待父进程写线程。

`set_custom_logfile(enqueue=False)` 为显式同步模式，仅用于离线命令或同步测试；其文件 I/O 仍可能阻塞调用方。stdout 本身的阻塞、宿主机调度、磁盘故障与真实峰值容量需另行验收，有界文件队列不提供普通日志零丢失保证。

标准 SQLAlchemy 连接池和项目观测连接池的正常连接寿命回收日志会从 INFO 降为 DEBUG，仅匹配无异常对象的 `Connection %r exceeded timeout; recycling` 模板。其他 INFO、告警、错误和连接失效事件保持级别。默认 INFO 不输出这类正常回收；控制台查看需设置 `LOG_LEVEL=DEBUG`，文件保留还需设置 `LOG_FILE_ACCESS_LEVEL=DEBUG`。连接回收周期仍为 300 秒，SQL 回显开关保持独立。

| 配置                      | 默认值                                     | 含义                                                       |
| ------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| LOG_LEVEL                 | INFO                                       | 控制台级别                                                 |
| LOG_JSON                  | 部署环境 true，本地/测试 false             | 控制台及文件使用同一 JSON 格式；false 保留文本             |
| LOG_FILE_ACCESS_LEVEL     | INFO                                       | 低级别文件阈值，接收 INFO/SUCCESS 等，不是纯 HTTP 访问日志 |
| LOG_FILE_ERROR_LEVEL      | WARNING                                    | WARNING 及以上文件阈值                                     |
| LOG_ACCESS_FILENAME       | access.log                                 | 活动文件基础名                                             |
| LOG_ERROR_FILENAME        | error.log                                  | 活动文件基础名                                             |
| LOG_FILE_MAX_BYTES        | LOCAL 20 MiB，其他环境 100 MiB             | 单个文件轮转阈值                                           |
| LOG_FILE_RETENTION_DAYS   | LOCAL 3，其他环境 7                        | 历史文件保存天数                                           |
| LOG_FILE_BUDGET_BYTES     | LOCAL 200 MiB，生产 Compose 5 GiB/角色     | LOCAL 对整个 `logs/dev/` 生效；其他环境按共享目录计量      |
| LOG_FILE_MIN_FREE_BYTES   | 67108864                                   | 写入后要求保留的文件系统空闲空间                           |
| RUNTIME_STATE_DIR         | 普通环境不设，生产 `/tmp/rapidkit-runtime` | 与 Redis、运行日志目录独立的数值快照                       |
| SLOW_REQUEST_THRESHOLD_MS | 3000                                       | 慢请求 WARNING 阈值                                        |

### 开发环境的固定入口

`ENVIRONMENT=LOCAL` 按服务和启动会话组织文件，排查时打开固定目录：

```text
logs/dev/
  api/current/
    access.log       # 当前 API 进程的普通运行日志
    error.log        # 当前 API 进程的 WARNING 及以上日志
    processes/<pid>/ # 本次启动中各进程的独立文件，含热重载历史
  worker/current/processes/<pid>/ # Worker 父进程和各子进程
  beat/current/
    access.log
    error.log
    processes/<pid>/
  archive/<service>/ # 已退出的历史会话
```

`current` 指向本次启动的会话目录。API、Beat 的 `access.log` 和 `error.log` 是相对符号链接，指向当前初始化进程的文件；没有告警时 `error.log` 为空。热重载会自动切换入口，使用 `tail -F logs/dev/api/current/access.log logs/dev/api/current/error.log` 可以继续跟随。固定入口使用 `LOG_ACCESS_FILENAME`、`LOG_ERROR_FILENAME` 的配置基础名，支持自定义相对路径和扩展名。

真实文件集中放在 `processes/<pid>/` 中，仍用 `access.<hostname>.<pid>.log`、`error.<hostname>.<pid>.log` 隔离轮转。根目录不再铺开各 PID 的文件。旧版会话根目录中可确认退出的本机进程文件会整理到 `processes/<pid>/`；活跃、远程、未知文件及符号链接保留，不覆盖已有整理目标。

进程目录同时记录进程参与状态，新会话不再创建根目录 `.pid-*` 文件。旧版空 PID 标记只在确认进程退出后清理；仍存活、无法检查或含未知内容的标记保留。

Worker 同时有多个写入进程，查看整组输出应搜索 `logs/dev/worker/current/processes/`；例如 `rg '任务编号' logs/dev/worker/current/processes/ --glob '*.log'`。这里不提供只指向父进程的 `access.log` 或 `error.log`，避免漏掉子进程信息。API、Worker、Beat 按上级服务目录区分。

固定 API/Beat 入口用于 LOCAL 单进程开发。若在同一会话运行多个 API 进程，入口显示最近初始化的进程，完整输出仍在 `processes/`。检索本次启动的全部错误使用 `rg '关键词' logs/dev/api/current/processes/ --glob 'error.*.log'`。

`pnpm --filter @rapidkit/backend dev` 在重载父进程生成会话标识。直接启动 Uvicorn 的 spawn 子进程也会复用父进程已有的会话。Worker 父进程通过环境变量把会话传给子进程。新的独立启动更新 `current`；旧启动的子进程不会覆盖它。`migrate`、`exporter` 等角色使用同一目录规则。

日志模块统一创建项目根目录下的 `logs`，启动脚本不按当前工作目录额外创建 `apps/backend/logs`。`RAPIDKIT_BASE_PATH` 可覆盖根路径；正式 Compose 使用 `/app/logs`，并挂载到宿主机各服务目录。

启动和写线程每小时检查历史会话：整个会话的父进程和参与进程均确认退出后，才移入 `archive`。每个服务最多保留最近 3 个历史会话，默认最长 3 天。活跃、远程主机、权限不足、元数据不明的会话不自动删除。清理可能在下次启动或写入时才发生。

LOCAL 默认每文件 20 MiB，整个 `logs/dev/` 的普通文件总预算 200 MiB；已有显式设置优先。预算不足时先回收已退出的历史会话，再回收已轮转或确认退出进程的旧文件。仍无法腾出空间时丢弃本条文件副本并计数，stdout 继续输出。活跃进程正在写入的文件不删除。默认预算复用 POSIX 文件锁，适用于当前 Linux/Docker 开发环境。

旧 `logs/` 根目录文件不会自动搬入新会话，也不计入 LOCAL 的新预算。切换时先盘点，再单独清理确认退出的本机开发进程文件；不要批量删除远程、未知来源或仍在写入的文件。`logs/verification/` 始终独立保留。

### 部署环境的进程隔离

其他环境继续直接使用配置目录。实际活动文件带 hostname.pid 后缀，例如 `access.host.123.log`；归档保留实例标识，例如 `access.host.123.2026-10-30.log`，同日冲突追加序号，不覆盖旧文件。轮转按记录生成时的进程本地日期和 UTF-8 大小判断；超过剩余目录预算的整条普通文件记录会被丢弃，并独立计数和报告。

支持自定义相对路径与扩展名，按各基础文件所在目录清理。清理每小时最多扫描一次，启动强制执行；只处理匹配规则的普通文件，跳过符号链接、存活或无法确认存活的进程，以及远程 hostname 的未归档文件。`logs/verification/` 存放开发验证结果，排除在运行日志保留策略之外，不能提交。

生产 Compose 按 api/worker/beat/migrate 角色挂载宿主机目录，Docker stdout 使用 20m×5 轮转。共享预算与宿主机维护覆盖退出实例日志；文件落盘失败不阻断业务，独立指标与 stderr 标记提示丢失。目录准备、首次迁移、集中采集去重与真实平台验收见[生产可观测性](./observability)。单机目录不能替代异机采集与备份。

## 指标与退化状态

依赖失败与慢操作按每进程 component/operation 和 failed/slow 分类限频：首次立即记录，同类持续发生每 60 秒最多一条 WARNING，`observation_count` 是本次异常段累计次数。所有调用继续逐次更新指标。请求、任务和身份编号只保留当前采样事件的上下文，不列出被汇总的每条记录。同类操作至少 60 秒无失败后，下一次成功输出一次 `dependency.recovered`；正常查询夹在失败查询之间不会反复触发恢复，无后续调用时不宣告恢复。

共享 Redis 池达到 `REDIS_MAX_CONNECTIONS`（默认 10）时，调用协程等待连接释放，事件循环继续处理其他任务。`REDIS_POOL_TIMEOUT_SECONDS` 默认 5 秒，必须为有限正数；到期仍无连接时抛出 `ConnectionError` 并按依赖失败记录。该配置控制连接池容量等待，不替代网络超时。不同命名池各自限制容量，修改配置后需重启相应进程。

后台组件首次退化保留异常栈，持续失败每 60 秒输出一次带组件名、累计次数和异常类型的摘要，不重复展开同一异常段。任务事件持久化也要求 60 秒无失败后的成功处理才确认恢复，避免成功心跳夹在失败任务之间造成反复退化/恢复。此判定只影响诊断状态，失败事件仍保持待处理，ACK 和事务规则沿用原实现。

SQL 原文回显默认关闭，包括 LOCAL。确需临时 SQL 诊断时显式设置 `SQL_ECHO=true` 并重启相应进程；只在 LOCAL/STAGING/TESTING 生效，PRODUCTION 始终关闭，参数继续隐藏。此开关独立于 `LOG_LEVEL`，关闭回显不关闭安全依赖告警、耗时和错误指标。缺列等 schema 故障仍需核对数据库历史处理，日志降噪不修复数据库。

HTTP 完成日志、`rapidkit_http_requests_total` 和 Redis 端点统计从同一结果状态生成；HTTP 200 的业务失败计入错误。HTTP 5xx 与非零业务码保留各自统计，不重复写业务错误计数。`rapidkit_http_failures_total` 按固定 error_kind 区分预期拒绝与服务故障，ID 和任意异常文本不作为标签。

Redis 指标写入失败记录首次退化、每 60 秒摘要和一次恢复，摘要包含失败次数，避免刷屏。监控路径失败不能中断普通业务响应。仓库提供独立进程/全局采样、Prometheus/Alertmanager 可选部署及告警 runbook；真实 Sentry、集中日志与通知渠道仍需按部署环境接入验收。

任务关联索引、事务幂等、隔离与安全裁剪的操作步骤见[任务队列](./celery#观测事件恢复与运维)。它们恢复执行记录，不重新触发业务任务；生产端断连仍有丢失窗口。

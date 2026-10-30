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

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| LOG_LEVEL | INFO | 控制台级别 |
| LOG_JSON | 部署环境 true，本地/测试 false | 控制台及文件使用同一 JSON 格式；false 保留文本 |
| LOG_FILE_ACCESS_LEVEL | INFO | 低级别文件阈值，接收 INFO/SUCCESS 等，不是纯 HTTP 访问日志 |
| LOG_FILE_ERROR_LEVEL | WARNING | WARNING 及以上文件阈值 |
| LOG_ACCESS_FILENAME | access.log | 活动文件基础名 |
| LOG_ERROR_FILENAME | error.log | 活动文件基础名 |
| LOG_FILE_MAX_BYTES | 104857600 | 单个文件轮转阈值，默认 100 MiB |
| LOG_FILE_RETENTION_DAYS | 7 | 归档和可确认退出的本机进程文件保存期 |
| SLOW_REQUEST_THRESHOLD_MS | 3000 | 慢请求 WARNING 阈值 |

实际活动文件带 hostname.pid 后缀，例如 `access.host.123.log`；归档保留实例标识，例如 `access.host.123.2026-10-30.log`，同日冲突追加序号，不覆盖旧文件。轮转按进程本地日期和 UTF-8 大小判断，单条超大记录保留完整，不为满足轮转阈值静默截断。

支持自定义相对路径与扩展名，按各基础文件所在目录清理。清理每小时最多扫描一次，启动强制执行；只处理匹配规则的普通文件，跳过符号链接、存活或无法确认存活的进程，以及远程 hostname 的未归档文件。`logs/verification/` 存放开发验证结果，排除在运行日志保留策略之外，不能提交。

文件轮转不约束 Docker stdout 大小，容器内文件也不能抵抗容器删除。宿主机挂载、总容量预算、退出实例回收、集中采集和真实告警部署属于后续运维批次；单机目录也不能替代跨机备份。

## 指标与退化状态

HTTP 完成日志、`rapidkit_http_requests_total` 和 Redis 端点统计从同一结果状态生成；HTTP 200 的业务失败计入错误。HTTP 5xx 与非零业务码保留各自统计，不重复写业务错误计数。`rapidkit_http_failures_total` 按固定 error_kind 区分预期拒绝与服务故障，ID 和任意异常文本不作为标签。

Redis 指标写入失败记录首次退化、每 60 秒摘要和一次恢复，摘要包含失败次数，避免刷屏。监控路径失败不能中断普通业务响应。Prometheus 抓取、Sentry 错误聚合和告警渠道仍需单独部署与演练。

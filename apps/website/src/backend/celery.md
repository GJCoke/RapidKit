# 任务队列

## 架构概览

项目使用 Celery 作为分布式任务队列，Redis 同时作为 Broker 和 Backend。Celery 使用独立的 Redis 数据库（默认 `CELERY_REDIS_DATABASE=1`），与业务 Redis 隔离。

核心组件：

| 组件             | 路径                     | 说明                                                    |
| ---------------- | ------------------------ | ------------------------------------------------------- |
| 自定义 Celery 类 | `src/queues/celery.py`   | 增强类型提示，默认使用自定义 Task 基类                  |
| 自定义 Task 类   | `src/queues/task.py`     | 支持 async def，隔离身份并丢弃任意 stdout               |
| Celery 应用      | `src/queues/app.py`      | 应用实例、配置、任务自动发现                            |
| Signal 处理      | `src/queues/signals.py`  | Worker 进程中注册信号，发布事件到 Redis Stream          |
| 事件消费者       | `src/queues/consumer.py` | FastAPI 进程中消费 Redis Stream，持久化并推送 WebSocket |
| 任务定义         | `src/queues/tasks/`      | 具体任务函数                                            |

整体数据流：

```
Celery Worker (Signal) → Redis Stream → FastAPI Consumer → PostgreSQL + Socket.IO
```

## 配置

关键配置项由 `rapidkit_core.config.settings` 和队列配置提供：

| 配置                    | 默认值 | 说明                           |
| ----------------------- | ------ | ------------------------------ |
| `CELERY_REDIS_DATABASE` | `1`    | Celery 使用的 Redis 数据库编号 |
| `ENABLE_CELERY_MONITOR` | `True` | 是否启用事件消费和 Worker 监控 |

```python
# src/queues/app.py
REDIS_URL = str(settings.CELERY_REDIS_URL)
app = Celery("celery_app", broker=REDIS_URL, backend=REDIS_URL)
app.conf.update({"timezone": settings.DATETIME_TIMEZONE, "database_url": DATABASE_URL, "refresh_interval": 60})
app.autodiscover_tasks(["src.queues.tasks"])

# 仅在启用监控时加载信号处理器
if settings.ENABLE_CELERY_MONITOR:
    import src.queues.signals
```

:::info
将 `ENABLE_CELERY_MONITOR` 设为 `False` 可在不需要 Celery 功能的开发场景下跳过事件消费和 Worker 监控。
:::

## 信号与事件消费

项目采用 Signal + Redis Stream + Consumer 三层架构解耦 Celery Worker 与 FastAPI 进程。

### Worker 端（Signal）

在 `src/queues/signals.py` 中注册 Celery Signal，捕获事件并发布到 Redis Stream（`celery:events`）：

| Signal            | 事件类型         | 说明                     |
| ----------------- | ---------------- | ------------------------ |
| `task_prerun`     | `task.started`   | 任务开始执行             |
| `task_postrun`    | `task.success`   | 任务成功完成             |
| `task_failure`    | `task.failure`   | 任务失败（含异常和堆栈） |
| `task_retry`      | `task.retry`     | 任务重试                 |
| `task_revoked`    | `task.revoked`   | 任务被撤销               |
| `worker_ready`    | `worker.online`  | Worker 上线              |
| `worker_shutdown` | `worker.offline` | Worker 下线              |

Worker 上线后还会启动独立线程，每 30 秒发送心跳事件（`worker.heartbeat`）。

### FastAPI 端（Consumer）

`src/queues/consumer.py` 中的 `consume_events()` 以后台任务运行，使用 `XREADGROUP` 消费 Redis Stream：

```
Redis Stream (celery:events)
    │
    ▼
consume_events() ── XREADGROUP → 解析事件
    │
    ├── worker.online  → 写入/更新 CeleryWorker 表 → Socket.IO 推送
    ├── worker.offline → 更新 CeleryWorker 状态 → Socket.IO 推送
    ├── task.started   → 写入 CeleryTaskResult 表 → Socket.IO 推送
    ├── task.success   → 更新安全执行摘要 → 提交后 Socket.IO 推送
    ├── task.failure   → 记录异常类型和安全帧 → 提交后 Socket.IO 推送
    ├── task.retry     → 更新重试计数
    └── task.revoked   → 标记任务为终态
```

:::warning
同一 attempt 的终态不会被重复或乱序事件覆盖；旧 attempt 不会覆盖新 attempt。新一次合法重试可以继续执行。
:::

## 自定义 Task 基类

`src/queues/task.py` 中的 `Task` 类继承自 `celery.Task`，提供两个核心增强：

### async def 支持

重写 `__call__` 方法，自动检测 `run()` 返回值是否为协程，若是则在事件循环中执行：

```python
def __call__(self, *args, **kwargs):
    result = self.run(*args, **kwargs)
    if asyncio.iscoroutine(result):
        try:
            loop = asyncio.get_running_loop()
            return loop.run_until_complete(result)
        except RuntimeError:
            return asyncio.run(result)
    return result
```

### 安全诊断与关联

真实任务参数和返回值保持执行语义，观测副本不保存任意 args、kwargs、返回值和 stdout；任务详情明确隐藏这些字段，历史数据也不能经读取接口重新暴露。需要进度时使用已审阅的结构化 logger 事件，不要 print 凭证或业务载荷。详见[日志系统](./logging)。

接收阶段的未知任务、未知消息、非法任务及解码错误通过 `SafeConsumer` 与 Core 标准日志拦截器输出固定事件和安全编号，原 ACK/拒绝和失败记录继续由 Celery 执行。升级 Celery 后须回归这四类真实回调，确认 SDK 错误模板仍被拦截。Worker 父进程、prefork 子进程和 Beat 默认使用有界文件投递，子进程重新绑定文件及写线程；正常 Worker 停机最多等待 1 秒排空，不保证强杀时保留尾部。队列和写入耗时指标、超大记录及文件拥塞策略见日志系统。

任务发布与执行传递 request_id、correlation_id、可信身份和 attempt。手动触发的审计流程优先使用 audit_correlation_id；没有 HTTP 来源时生成独立请求关联。Worker 结果表新增 nullable 索引列 request_id/correlation_id，列表和详情返回这些字段，GET /tasks 支持 requestId/correlationId 精确筛选，仍需 task:read 权限并保留原时间范围筛选。旧行关联为空，不做推测性回填。

任务内普通日志也绑定真实投递的 task_id、task_name、attempt、correlation_id 和 user_id/actor_id/impersonation_session_id。绑定覆盖依赖创建、执行及关闭；同步和异步任务都适用，`asyncio.to_thread` 继承上下文，结束或异常后恢复外层字段。同一 request_id 下的多个任务应按 task_id 和 attempt 区分，流程编号优先 audit_correlation_id，其次 correlation_id，最后 request_id。只绑定安全编号，不记录参数、返回值或任意 header。没有投递元数据的直接调用不编造 task_id。

结果关联与执行审计在同一个 PostgreSQL 事务保存，审计 request_id 复用任务关联；流程关联依次回退到 audit_correlation_id、correlation_id、request_id、task_id。消费者使用事务级任务锁处理首次并发创建，并锁住 Worker 计数行。重复开始、重试、终态不会重复累计计数/审计；没有开始事件的终态不扣减其他任务的活跃计数。业务通知在提交后执行，数据库回滚时不提前宣布任务完成。Socket/内存事件总线通知仍非持久 outbox，不能承诺提交后崩溃也一定推送。

## 观测事件恢复与运维

此链路恢复的是执行记录，不重新执行业务任务。消费者组为 fastapi-consumers，活跃流为 celery:events，隔离流为 celery:events:dead；使用业务 Redis，不能误查 Celery broker 的另一个 DB。

- DB 事务与审计成功提交后才 XACK。数据库/Redis 短暂失败不按固定次数丢弃，保留 pending。
- 每次数据库处理预算 20 秒，接管空闲阈值 60 秒，避免正常处理中的记录被频繁抢占。每轮新消息和回收消息各有批次预算，新消息优先，不让旧积压永久饿死心跳。
- JSON、事件类型、身份、attempt、字段长度和时间戳先验证。已知不可解析的事件原子写入安全隔离流后 ACK；隔离写入失败仍留 pending。不会打印或归档原始坏 payload。任务 ID 沿用执行审计的 100 字符限制，原生 Celery UUID 不受影响。
- 生产端不再使用无条件 MAXLEN。默认保留至少 7 天；这是观测流窗口，不是容量上限或 SLA。
- Lua 在一次原子操作里核对实际/登记组集合，以时间窗口、所有组 last-delivered-id 和最老 pending 的最低水位裁剪；每次最多删除 1000 条。未知/缺失组或新组水位为 0 时不裁剪。新增组必须同步 REGISTERED_GROUPS。隔离流不自动裁剪、不设 TTL；需独立归档/容量管理。
- 自动裁剪由单例 observability 采样器执行，消费者不再承担每分钟维护。每轮最多10次原子裁剪，共用该组件5秒总时限；不足1000条即结束。采样轮完成后等待10秒。维护不占用业务事务，也不等待消费批次；采样器停止则维护暂停。部署必须保留采样器、失效告警及[容量验收](./observability#stream-retention)。手工 trim 命令仍只执行一次最多1000条的原子裁剪。
- Redis 7 XAUTOCLAIM 返回源内容已丢失的 pending ID 时输出 task.event.gap ERROR。这表示历史硬裁剪或人工删除造成缺口，不能称为恢复成功。
- 发布失败输出本地安全 task.event.publish_failed ERROR，并累计进程内失败计数；它不依赖 Redis 回传，也不改变业务任务结果；发布连接/读写各设 2 秒超时，禁用客户端自动重试，防止观测通道无限阻塞任务收尾。恢复写入时会说明缺失事件未补回；没有生产端 durable outbox，Redis 断开期间仍可能丢观测记录。

在已配置后端环境的容器中使用内部运维命令，不新增 Web 公共入口：

```bash
python -m src.queues.event_stream status
python -m src.queues.event_stream trim
python -m src.queues.event_stream replay <dead-id> --timestamp <经核实的生产者ISO时间>
```

status 返回 pending、最老源消息年龄、lag、dead 和 groups_valid。Redis 不可用会报错，不返回伪造的健康零值；lag 无法确认时为 null。它供后续 C 批次的单一采样者接入，不应由所有 API 副本重复求和；不包含 Worker 进程本地失败计数的远程聚合。

回放前先检查固定 reason_code 和安全元数据，修复确定性错误原因。当前可恢复的 invalid_timestamp 事件保留已校验的安全数据，必须显式提供经核实的原始时间；其余没有完整安全身份的隔离记录拒绝回放。命令只往观测流追加，不调用 Celery send_task，也不删除隔离证据。重复回放依靠数据库幂等，不增加执行审计。没有原始凭证副本可用于“修复”。本次代码交付不等于授权在线回放或删除历史队列。

数据库故障先恢复依赖，再观察 pending 年龄和处理进度；隔离流增长、task.event.gap、发布失败和长期 group_mismatch 应告警并调查。[生产可观测性](./observability)提供独立 Worker 发布指标、单例全局 exporter、宿主机容量与通知配置；实际平台仍需上线验收。

### 任务详情保留

`TASK_RESULT_RETENTION_DAYS` 默认不设。显式启用后只清理过期终态，跳过 pending、未读、隔离流引用；队列状态未知则暂停。迁移 `508976be24b7` 增加最小 `TaskReceipt`，在同一事务锁下替代被清理详情的观测幂等依据，防止迟到事件重建结果、重复计数或审计。审计表与隔离证据不自动删除，凭据也不自动过期。

先备份并 dry-run，详见[清理与回滚](./observability#任务详情清理与回滚)。一旦已清理，回滚消费者也必须支持凭据，不能降回 B 或删除 receipt 表；停用配置不会恢复已删除详情。

### 迁移与发布顺序

仓库原先没有迁移版本源文件，本次提供 Worker 基线 20d0b7afff25 和关联增量 09643ec2170c。全新 Worker schema 可以按新链创建；已有数据库必须先核对现存 Alembic revision 和表结构，确认与基线等价后由部署流程处理版本衔接。不能对未知线上库盲目 stamp 或应用建表基线；已有私有迁移链要先对接真实 predecessor。这是上线条件，本次只在隔离 PostgreSQL 验证。

先审查增量迁移（两个 nullable 列及索引），再运行项目 CLI 的 worker upgrade，最后更新消费端与写入端。增量无关联回填、不修改历史诊断值。大表普通索引创建会持锁，发布前评估窗口；需要在线建索引时必须另行制定相应迁移。应用回滚保留新增列和队列，不用删列或清空 pending 回滚。禁止降到基线以下，基线 downgrade 会删除 Worker 表。

## Worker 监控

Worker 状态追踪基于心跳检测机制：

1. Worker 上线时注册 `worker.online` 事件，Consumer 创建或更新 `CeleryWorker` 记录
2. Worker 运行期间每 30 秒发送 `worker.heartbeat`，Consumer 更新 `last_heartbeat` 时间
3. `check_worker_offline()` 后台任务每 30 秒扫描一次，将心跳超过 90 秒的 Worker 标记为 `OFFLINE`
4. Worker 正常关闭时发送 `worker.offline` 事件

所有状态变更通过 `/worker` 命名空间实时推送到前端。

`CeleryWorker` 模型记录的信息：

| 字段                | 说明                                       |
| ------------------- | ------------------------------------------ |
| `hostname`          | Worker 主机名                              |
| `status`            | 在线状态（ONLINE / OFFLINE）               |
| `concurrency`       | 并发数                                     |
| `software_info`     | Celery 版本、Python 版本、平台信息         |
| `active_task_count` | 当前活跃任务数                             |
| `processed_count`   | 已记录终态任务数（含撤销，重放不重复累计） |
| `last_heartbeat`    | 最后心跳时间                               |

## 添加新任务

1. 在 `src/queues/tasks/` 目录下创建任务函数：

```python
# src/queues/tasks/tasks.py
from src.queues.app import app


@app.task
async def send_notification(user_id: str, message: str) -> None:
    # 业务逻辑；不要输出消息体或用户凭证。
    ...
```

2. 使用 `@app.task` 装饰器注册任务。装饰器支持丰富的配置参数：

| 参数          | 说明                        |
| ------------- | --------------------------- |
| `name`        | 自定义任务名称              |
| `bind`        | 绑定任务实例（`self` 参数） |
| `max_retries` | 最大重试次数（默认 3）      |
| `rate_limit`  | 速率限制（如 `"100/m"`）    |
| `time_limit`  | 硬超时时间（秒）            |
| `queue`       | 指定队列名称                |

3. 任务结果自动通过 Signal → Redis Stream → Consumer 链路记录到 `CeleryTaskResult` 表。

调用任务：

```python
# 同步调用（发送到队列）
send_notification.apply_async(args=("user-123", "Hello!"))

# 延迟调用
send_notification.apply_async(args=("user-123", "Hello!"), countdown=60)
```

:::info
`app.autodiscover_tasks(["src.queues.tasks"])` 会自动发现 `src/queues/tasks/` 下的所有任务模块，无需手动注册。
:::

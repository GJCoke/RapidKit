# 任务队列

## 架构概览

项目使用 Celery 作为分布式任务队列，Redis 同时作为 Broker 和 Backend。Celery 使用独立的 Redis 数据库（默认 `CELERY_REDIS_DATABASE=1`），与业务 Redis 隔离。

核心组件：

| 组件             | 路径                     | 说明                                                    |
| ---------------- | ------------------------ | ------------------------------------------------------- |
| 自定义 Celery 类 | `src/queues/celery.py`   | 增强类型提示，默认使用自定义 Task 基类                  |
| 自定义 Task 类   | `src/queues/task.py`     | 支持 async def，捕获 stdout 作为日志                    |
| Celery 应用      | `src/queues/app.py`      | 应用实例、配置、任务自动发现                            |
| Signal 处理      | `src/queues/signals.py`  | Worker 进程中注册信号，发布事件到 Redis Stream          |
| 事件消费者       | `src/queues/consumer.py` | FastAPI 进程中消费 Redis Stream，持久化并推送 WebSocket |
| 任务定义         | `src/queues/tasks/`      | 具体任务函数                                            |

整体数据流：

```
Celery Worker (Signal) → Redis Stream → FastAPI Consumer → PostgreSQL + Socket.IO
```

## 配置

关键配置项在 `src/core/config.py` 的 `Config` 类中：

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

| Signal            | 事件类型                        | 说明                     |
| ----------------- | ------------------------------- | ------------------------ |
| `task_prerun`     | `task.started`                  | 任务开始执行             |
| `task_postrun`    | `task.success` / `task.failure` | 任务执行完成             |
| `task_failure`    | `task.failure`                  | 任务失败（含异常和堆栈） |
| `task_retry`      | `task.retry`                    | 任务重试                 |
| `task_revoked`    | `task.revoked`                  | 任务被撤销               |
| `worker_ready`    | `worker.online`                 | Worker 上线              |
| `worker_shutdown` | `worker.offline`                | Worker 下线              |

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
    ├── task.success   → 更新任务结果和日志 → Socket.IO 推送
    ├── task.failure   → 记录异常和堆栈 → Socket.IO 推送
    ├── task.retry     → 更新重试计数
    └── task.revoked   → 标记任务为终态
```

:::warning
已到达终态（如 `REVOKED`）的任务不会被后续事件覆盖，防止撤销后的异步回调错误地更新状态。
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

### stdout 捕获

任务执行期间，`sys.stdout` 被重定向到 `io.StringIO`，执行结束后捕获的内容存储为 `_logs` 属性，随任务结果一起持久化到数据库：

```python
captured = io.StringIO()
old_stdout = sys.stdout
sys.stdout = captured
try:
    result = self.run(*args, **kwargs)
    ...
finally:
    sys.stdout = old_stdout
    self._logs = captured.getvalue() or None
```

## Worker 监控

Worker 状态追踪基于心跳检测机制：

1. Worker 上线时注册 `worker.online` 事件，Consumer 创建或更新 `CeleryWorker` 记录
2. Worker 运行期间每 30 秒发送 `worker.heartbeat`，Consumer 更新 `last_heartbeat` 时间
3. `check_worker_offline()` 后台任务每 30 秒扫描一次，将心跳超过 90 秒的 Worker 标记为 `OFFLINE`
4. Worker 正常关闭时发送 `worker.offline` 事件

所有状态变更通过 `/worker` 命名空间实时推送到前端。

`CeleryWorker` 模型记录的信息：

| 字段                | 说明                               |
| ------------------- | ---------------------------------- |
| `hostname`          | Worker 主机名                      |
| `status`            | 在线状态（ONLINE / OFFLINE）       |
| `concurrency`       | 并发数                             |
| `software_info`     | Celery 版本、Python 版本、平台信息 |
| `active_task_count` | 当前活跃任务数                     |
| `processed_count`   | 已处理任务总数                     |
| `last_heartbeat`    | 最后心跳时间                       |

## 添加新任务

1. 在 `src/queues/tasks/` 目录下创建任务函数：

```python
# src/queues/tasks/tasks.py
from src.queues.app import app


@app.task
async def send_notification(user_id: str, message: str) -> None:
    print(f"Sending notification to {user_id}...")
    # 业务逻辑
    print("Notification sent.")
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

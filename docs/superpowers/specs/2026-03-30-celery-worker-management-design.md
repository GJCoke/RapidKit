# Celery Worker 管理功能设计

> **日期**: 2026-03-30
> **阶段**: 第一阶段（共规划多阶段）
> **状态**: 设计完成，待实现

## 概述

在现有管理后台中新增 Celery Worker 管理模块，提供 Worker 状态实时监控、任务执行历史追踪、手动触发任务三大能力。采用事件驱动架构，通过 Celery Signal 捕获事件写入 Redis Stream，FastAPI 消费后持久化到 PostgreSQL 并通过 Socket.IO 实时推送前端。

## 阶段规划

| 阶段                 | 内容                                         | 状态     |
| -------------------- | -------------------------------------------- | -------- |
| **第一阶段（本次）** | Worker 状态看板、任务执行历史、手动触发任务  | 设计完成 |
| 第二阶段             | 统计仪表盘（成功率、平均耗时、吞吐量图表）   | 待规划   |
| 第三阶段             | 任务调度管理（定时任务 / Beat 管理）         | 待规划   |
| 第四阶段             | Worker 生命周期管理（启动/停止/重启/扩缩容） | 待规划   |

---

## 架构设计

### 整体数据流

```
┌─────────────┐     Celery Signals      ┌──────────────┐
│ Celery      │ ──────────────────────▶  │ Redis Stream │
│ Worker(s)   │  task_prerun/postrun     │ celery:events│
│             │  worker_online/offline   └──────┬───────┘
└─────────────┘                                 │
                                                │ consume
                                                ▼
                                   ┌────────────────────────┐
                                   │ FastAPI Background Task │
                                   │ (stream consumer)      │
                                   │                        │
                                   │  ┌──────────────────┐  │
                                   │  │ Write PostgreSQL  │  │
                                   │  │ (event records)   │  │
                                   │  └──────────────────┘  │
                                   │  ┌──────────────────┐  │
                                   │  │ Emit Socket.IO   │  │
                                   │  │ (real-time push)  │  │
                                   │  └──────────────────┘  │
                                   └────────────────────────┘
                                                │
                                      Socket.IO │ REST API
                                                ▼
                                   ┌────────────────────────┐
                                   │ Vue 3 Frontend         │
                                   │ Worker 管理页面         │
                                   └────────────────────────┘
```

### 方案选型理由

选择 **Celery Signal + Redis Stream + FastAPI 消费者**（方案 A），而非直接写数据库或独立事件收集服务：

- 事件产生端（Worker）与消费端（API Server）解耦，互不阻塞
- Redis Stream 提供可靠的事件传递，支持消费者组和消息确认
- 完全复用现有 Redis + Socket.IO 基础设施，无需额外部署服务
- Worker 端仅需轻量 signal handler，不影响任务处理性能

---

## 数据模型

### Worker 状态表 `celery_workers`

| 字段              | 类型         | 说明                                   |
| ----------------- | ------------ | -------------------------------------- |
| id                | UUID (PK)    | UUIDv7，继承自公共基类                 |
| hostname          | str (unique) | Worker 主机名标识，如 `celery@worker1` |
| status            | WorkerStatus | `ONLINE("1")` / `OFFLINE("2")`         |
| active_queues     | JSON         | 当前监听的队列列表                     |
| concurrency       | int          | 并发数                                 |
| processed_count   | int          | 已处理任务总数                         |
| active_task_count | int          | 当前正在执行的任务数                   |
| load_average      | JSON         | 系统负载信息                           |
| software_info     | JSON         | Celery 版本、Python 版本等             |
| last_heartbeat    | datetime     | 最后一次心跳时间                       |
| create_time       | datetime     | 首次上线时间（继承）                   |
| update_time       | datetime     | 最后更新时间（继承）                   |

### 任务执行记录表 `celery_task_results`

| 字段            | 类型                | 说明                                                                                              |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| id              | UUID (PK)           | UUIDv7                                                                                            |
| task_id         | str (unique, index) | Celery 原生 task_id                                                                               |
| task_name       | str (index)         | 任务函数全名，如 `queues.tasks.tasks.test_celery`                                                 |
| status          | TaskStatus          | `PENDING("1")` / `STARTED("2")` / `SUCCESS("3")` / `FAILURE("4")` / `RETRY("5")` / `REVOKED("6")` |
| worker_hostname | str (index)         | 执行该任务的 worker                                                                               |
| args            | JSON                | 位置参数                                                                                          |
| kwargs          | JSON                | 关键字参数                                                                                        |
| result          | JSON                | 返回值（成功时）                                                                                  |
| exception       | text                | 异常信息（失败时）                                                                                |
| traceback       | text                | 完整堆栈（失败时）                                                                                |
| started_at      | datetime            | 开始执行时间                                                                                      |
| finished_at     | datetime            | 完成时间                                                                                          |
| runtime         | float               | 执行耗时（秒）                                                                                    |
| retries         | int                 | 重试次数                                                                                          |
| create_time     | datetime            | 记录创建时间（继承）                                                                              |
| update_time     | datetime            | 记录更新时间（继承）                                                                              |

### 枚举定义

```python
class WorkerStatus(str, Enum):
    ONLINE = "1"
    OFFLINE = "2"

class TaskStatus(str, Enum):
    PENDING = "1"
    STARTED = "2"
    SUCCESS = "3"
    FAILURE = "4"
    RETRY = "5"
    REVOKED = "6"
```

枚举值沿用项目现有的字符串数字风格（与 `Status`、`MenuType` 一致）。

---

## API 设计

所有接口前缀 `/api/v1`，遵循现有 REST 风格和统一响应结构 `{code, message, data}`。

### Worker 接口

| 方法 | 路径                   | 说明                                            |
| ---- | ---------------------- | ----------------------------------------------- |
| GET  | `/workers`             | 分页查询 worker 列表，支持 status/hostname 筛选 |
| GET  | `/workers/all`         | 获取所有 worker（不分页，用于概览卡片）         |
| GET  | `/workers/{worker_id}` | 获取单个 worker 详情                            |

### 任务接口

| 方法 | 路径                      | 说明                                                         |
| ---- | ------------------------- | ------------------------------------------------------------ |
| GET  | `/tasks`                  | 分页查询任务历史，支持 status/task_name/worker_hostname 筛选 |
| GET  | `/tasks/{task_id}`        | 获取单个任务详情（含 traceback）                             |
| GET  | `/tasks/registered`       | 获取所有已注册的 Celery 任务列表（自动发现）                 |
| POST | `/tasks/trigger`          | 手动触发任务，body: `{ taskName, args?, kwargs? }`           |
| POST | `/tasks/{task_id}/revoke` | 撤销任务                                                     |

### 权限标识

| 权限码          | 说明                   |
| --------------- | ---------------------- |
| `worker:list`   | 查看 Worker 列表       |
| `worker:detail` | 查看 Worker / 任务详情 |
| `task:trigger`  | 触发任务执行           |
| `task:revoke`   | 撤销任务               |

所有接口通过 `verify_user_permission` 依赖保护。

---

## Socket.IO 设计

### Namespace

使用独立 namespace `/worker`，前端进入 Worker 管理页面时连接，离开时断开。

### 事件定义

| 事件名          | 方向            | 数据                                                                              | 说明                      |
| --------------- | --------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `worker:status` | Server → Client | `{ hostname, status, concurrency, activeTaskCount, activeQueues, lastHeartbeat }` | Worker 上线/离线/心跳更新 |
| `task:update`   | Server → Client | `{ taskId, taskName, status, workerHostname, runtime?, exception? }`              | 任务状态变更              |

---

## Celery Signal 与 Redis Stream

### Signal 监听

在 Worker 进程启动时注册以下 signal handler：

| Celery Signal     | 写入的事件类型                  | 携带数据                                     |
| ----------------- | ------------------------------- | -------------------------------------------- |
| `worker_ready`    | `worker.online`                 | hostname, queues, concurrency, software_info |
| `worker_shutdown` | `worker.offline`                | hostname                                     |
| `task_prerun`     | `task.started`                  | task_id, task_name, args, kwargs, hostname   |
| `task_postrun`    | `task.success` / `task.failure` | task_id, state, retval/exception, runtime    |
| `task_failure`    | `task.failure`                  | task_id, exception, traceback                |
| `task_retry`      | `task.retry`                    | task_id, reason                              |
| `task_revoked`    | `task.revoked`                  | task_id                                      |

### 心跳机制

通过 `worker_init` 信号启动一个周期性线程，每 **30 秒**发送 `worker.heartbeat` 事件。

### Redis Stream 配置

- **Stream key**: `celery:events`
- **Consumer group**: `fastapi-consumers`
- **消息格式**: `{ "event_type": "...", "timestamp": "...", "data": { ... } }`
- **消费方式**: `XREADGROUP`，阻塞读取，处理后 `XACK` 确认
- **清理策略**: `MAXLEN ~10000`，避免内存无限增长

### Worker 离线检测

FastAPI 侧启动定时协程，每 **30 秒**扫描一次，将 `last_heartbeat` 超过 **90 秒**的 worker 标记为 `OFFLINE`，并通过 Socket.IO 推送通知。

---

## 前端设计

### 页面布局

采用 **Dashboard + 抽屉详情** 布局，单路由 `/manage/worker`：

- **顶部区域**：Worker 卡片网格，每个卡片展示 hostname、在线状态指示灯、并发数、活跃任务数、监听队列。点击弹出 Worker 详情抽屉
- **下方区域**：任务实时流列表，展示最新任务的状态标签、任务名、worker、耗时、时间。点击弹出任务详情抽屉。支持状态/任务名/worker 筛选和分页
- **右上角**："触发任务"按钮，弹出模态框

### 交互组件

1. **Worker 详情抽屉** — 展示并发数、活跃任务、已处理总数、最后心跳、监听队列（标签样式）、软件信息、该 Worker 最近任务列表
2. **任务详情抽屉** — 展示 Task ID、worker、耗时、重试次数、开始/结束时间、参数（JSON）、异常信息和完整堆栈（失败时红色背景代码块）
3. **触发任务弹窗** — 下拉选择已注册任务（自动发现）、args 输入框（JSON 数组）、kwargs 输入框（JSON 对象）、取消/触发按钮

### 实时更新

- 进入页面时连接 Socket.IO `/worker` namespace
- `worker:status` 事件更新卡片状态（在线/离线、活跃任务数等）
- `task:update` 事件在任务流列表顶部插入新记录
- 离开页面时断开连接

---

## 文件结构

### 后端新增/修改

```
apps/backend/src/
├── domains/worker/          # 【新增】Worker 领域模块
│   ├── api.py               # REST 路由
│   ├── crud.py              # 数据库 CRUD
│   ├── models.py            # CeleryWorker、CeleryTaskResult 模型
│   ├── schemas.py           # Pydantic schemas
│   ├── services.py          # 业务逻辑
│   └── deps.py              # 依赖注入
├── queues/
│   ├── signals.py           # 【新增】Celery signal handler
│   └── consumer.py          # 【新增】Redis Stream 消费协程
├── sockets/
│   └── worker.py            # 【新增】/worker namespace Socket.IO
├── utils/
│   └── enums.py             # 【修改】新增 WorkerStatus、TaskStatus 枚举
└── main.py                  # 【修改】注册路由、启动消费协程
```

### 前端新增/修改

```
apps/frontend/src/
├── views/manage/worker/
│   ├── index.vue            # 【新增】Dashboard 主页面
│   └── modules/
│       ├── worker-cards.vue # 【新增】Worker 卡片网格
│       ├── task-stream.vue  # 【新增】任务实时流列表
│       ├── worker-drawer.vue# 【新增】Worker 详情抽屉
│       ├── task-drawer.vue  # 【新增】任务详情抽屉
│       └── trigger-modal.vue# 【新增】触发任务弹窗
├── service/api/
│   └── worker.ts            # 【新增】Worker API 函数
└── typings/
    └── schema.d.ts          # 【更新】openapi-typescript 重新生成
```

---

## 约束与边界

- 本阶段不含统计图表、定时任务管理、Worker 生命周期管理
- 不直接控制 Worker 进程的启停（属于后续阶段）
- 任务触发仅支持已通过 `@app.task` 注册的任务，不支持动态任务名
- args/kwargs 输入需用户手动填写合法 JSON，前端做基础 JSON 格式校验
- Redis Stream 保留最近约 10000 条消息，更早的事件依赖数据库查询

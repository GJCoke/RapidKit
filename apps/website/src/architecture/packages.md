# 包依赖架构

## 概述

RapidKit 后端 Python 包采用三层架构，每层职责明确、依赖单向流动：

```
                    ┌─────────────┐
                    │  security   │  (独立，无内部依赖)
                    └──────┬──────┘
                           │
┌────────┐    ┌────────────┴───┐    ┌──────────┐    ┌─────────┐
│  core  │◄───│   framework    │◄───│  common  │◄───│ plugins │
└────────┘    └────────────────┘    └──────────┘    └─────────┘
```

## 各包职责

### rapidkit-core — 进程基建

> 「启动一个进程连上所有外部依赖所需的一切」

| 模块                  | 职责                                          |
| --------------------- | --------------------------------------------- |
| `config.py`           | BaseSettings + Config 类，settings 单例       |
| `database.py`         | SQLAlchemy engine、session 工厂、RedisManager |
| `redis_client.py`     | AsyncRedisClient 封装                         |
| `minio_client.py`     | MinIO 对象存储连接                            |
| `distributed_lock.py` | Redis 分布式锁                                |
| `leader_election.py`  | Redis 主节点选举                              |
| `batch_queue.py`      | 异步批量队列                                  |
| `log.py`              | Loguru 日志配置                               |
| `timezone.py`         | 时区工具                                      |
| `nanoid.py`           | 请求 ID                                       |
| `uuid7.py`            | UUID v7 生成器                                |

**依赖：** pydantic-settings, sqlmodel, redis, asyncpg, loguru, minio

### rapidkit-framework — 插件运行时

> 「把进程变成可扩展的插件化应用」

| 模块              | 职责                                        |
| ----------------- | ------------------------------------------- |
| `plugin.py`       | PluginManifest、生命周期声明                |
| `loader.py`       | 插件发现、拓扑排序、加载                    |
| `events.py`       | Event 基类 + EventBus（纯机制，无业务事件） |
| `exceptions.py`   | AppException、BaseHTTPException             |
| `status_codes.py` | StatusCode 枚举                             |
| `i18n.py`         | 可插拔翻译桥接                              |
| `limiter.py`      | 速率限制服务                                |
| `context.py`      | 请求上下文                                  |

**依赖：** rapidkit-core, fastapi, limits[redis], starlette-context, packaging

### rapidkit-security — 安全工具

> 「无状态的加密/签名/哈希纯函数」

| 模块          | 职责                              |
| ------------- | --------------------------------- |
| `jwt.py`      | JWT 令牌创建与解码                |
| `password.py` | bcrypt 密码哈希与校验             |
| `rsa.py`      | RSA 密钥对生成、加解密            |
| `types.py`    | AccessSecret / RefreshSecret 类型 |

**依赖：** authlib, bcrypt, cryptography, pydantic

**特性：** 完全独立，不依赖 core/framework/common。任何需要安全功能的包可直接依赖它。

### rapidkit-common — 业务脚手架

> 「写业务路由时的公共基类和工具」

| 模块        | 职责                                   |
| ----------- | -------------------------------------- |
| `crud.py`   | BaseCRUD 泛型基类                      |
| `models.py` | SQLModel 基类（id + timestamps）       |
| `schemas/`  | BaseModel、Response、PaginatedResponse |
| `deps.py`   | SessionDep、RedisDep                   |
| `auth.py`   | UserProtocol 接口契约                  |
| `utils.py`  | 通用工具函数                           |

**依赖：** rapidkit-core, rapidkit-framework

## 依赖规则

### 时间数据约定

- 数据库存储无时区 UTC，写入仍使用 `timezone.now()`；无需调整历史数据或数据库字段类型。
- Cron 使用 `DATETIME_TIMEZONE` 的业务日历，数据库条目显式绑定 Celery 应用；保持 `enable_utc=True`，刷新不重置执行状态。
- 统计自然日先用 `timezone.start_of_day(date)` 分别计算相邻日期的 UTC 边界。夏令时地区的一天可能是 23 或 25 小时，不能固定减 24 小时。
- UTC 时间列先投影到业务时区再按日聚合。日桶返回 `YYYY-MM-DD`，小时桶返回带偏移的时刻。
- `rapidkit_common.schemas.types.UTCInstant` 返回带 `+00:00` 的 ISO 时刻；`EditableInstant` 返回平台时区偏移，适用于编辑和平台时间展示。
- `LocalDatetime` 保留为兼容的纯展示字符串，不能再次按浏览器本地时区解释。时间差、过期判断和跨时区转换使用明确时刻。
- 登录信息 `/auth/user/info` 下发 `timezone`（来自 `DATETIME_TIMEZONE`），Vue 登录初始化完成后配置共享时区，退出时清空；React 从当前身份读取。前端展示与预约输入使用平台时区，不依赖浏览器或操作系统时区。
- 公告预约使用 `datetime-local` 日历字符串，通过 `parsePlatformTimeInput` 按平台 IANA 时区转换成带 `Z` 的 ISO 时刻；后端在请求边界转换为无时区 UTC 再入库。历史无偏移预约请求仍按 UTC 兼容。编辑未改动的时间保留原始时刻及毫秒；新建重复时段选择首次出现，不存在的夏令时时间拒绝提交。
- 通知 HTTP 和 Socket.IO 的创建、过期、已读等时间都携带偏移；前端过期判断采用时刻比较（到期即失效），今天／昨天按平台自然日分组。
- Vue 使用 `@/utils/datetime`，旧首页 UTC 字段显式按 UTC 解析，旧审计墙上时间按 catalog 时区解析。
- HTTP 与 Socket.IO 的时刻采用相同约定。日志中的偏移与业务时区独立，日志轮转跟随进程时区；阅读 UTC 日志时应按偏移换算。
- 发布时将后端序列化和对应前端解析一同更新，并重新生成 OpenAPI 类型；外部消费者需同步适配新的 ISO 时间格式。

### 监控归档约定

- API 分钟计数和响应时间样本保留给实时统计；另用 `metrics:api_hour:*` 保存两小时有效的小时累计快照，按请求所属 UTC 小时归档。
- 数据库以绝对累计值执行幂等 UPSERT，旧快照不能降低计数。既有归档总量在首次处理时固定为 Redis 基线；数据库提交后才标记已归档计数，任务重试和确认失败不会重复累加。
- 平均耗时按累计总耗时／次数计算，P95 沿用分钟样本窗口的最大值近似。历史重复累计无法仅靠总数准确还原，不自动重置。发布时应同步更新后端和归档 Worker，避免新旧归档逻辑同时运行。

### 层级原则

1. **依赖只能向下流动** — 上层可以依赖下层，反之不行
2. **同层不互相依赖** — core 和 security 处于同一层级，互不依赖
3. **插件间通过 PluginDependency 声明** — 需要其他插件的功能时显式声明依赖关系

### 导入路径对照表

| 功能                         | 导入路径                                 |
| ---------------------------- | ---------------------------------------- |
| 配置 / 数据库 / Redis / 日志 | `from rapidkit_core.xxx import ...`      |
| 插件 / 事件 / 异常 / 状态码  | `from rapidkit_framework.xxx import ...` |
| JWT / 密码 / RSA             | `from rapidkit_security import ...`      |
| CRUD / Schema / Deps         | `from rapidkit_common.xxx import ...`    |

### 事件归属规则

- **EventBus 机制**（Event 基类、EventBus 单例）→ `rapidkit_framework`
- **业务事件定义**（如 RolePermissionsChangedEvent）→ 生产者插件
- **消费者**通过 `PluginDependency` 声明依赖生产者，直接 import 事件类

```python
# 生产者（auth 插件）
from rapidkit_framework.events import Event

@dataclass
class RolePermissionsChangedEvent(Event):
    event_name: ClassVar[str] = "role.permissions_changed"
    role_code: str

# 消费者（menu 插件，声明依赖 auth）
from plugin_auth.events import RolePermissionsChangedEvent
```

## 新增包 / 模块的判断标准

| 你要写的代码...                    | 放在哪里    |
| ---------------------------------- | ----------- |
| 需要连接外部服务（DB/Redis/MinIO） | `core`      |
| 是插件系统的机制或 HTTP 框架层     | `framework` |
| 是无状态的加密/签名/哈希工具       | `security`  |
| 是多插件共用的业务脚手架           | `common`    |
| 是某个业务域的逻辑                 | 对应的插件  |

### 时区回归

运行 `pnpm test:timezones`，在独立进程中分别设置 `TZ=UTC`、`Asia/Shanghai`、`America/New_York`，执行 Vue/React 回归（含 jsdom 组件）。覆盖平台配置初始化和退出、过期边界、平台零点分组、上海预约遇到纽约浏览器夏令时跳跃、柏林夏冬偏移、无效／重复时段及编辑往返。该命令验证浏览器本地时区差异，不替代不同浏览器引擎的端到端验证。

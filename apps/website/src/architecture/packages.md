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

**依赖：** rapidkit-core, fastapi, slowapi, starlette-context, packaging

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

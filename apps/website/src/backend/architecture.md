# Backend 架构说明

## 架构概述

本项目后端采用 **插件化架构（Plugin-based Architecture）**，基于 FastAPI + SQLModel + async SQLAlchemy 构建。

核心设计思路：**业务代码以独立插件包组织，共享基础设施抽取到公共 workspace 包，通过插件加载器统一编排**。

```
rapidkit/
├── packages/
│   ├── core/              # rapidkit-core — 基础设施（配置、数据库、异常、日志）
│   └── common/            # rapidkit-common — 公共层（基类模型、CRUD、依赖、Schema）
├── apps/backend/
│   ├── src/               # 应用入口、中间件、Socket.IO、Celery 队列
│   │   ├── core/          #   配置扩展（auth_settings）、lifecycle
│   │   ├── middlewares/    #   HTTP 中间件
│   │   ├── sio/           #   Socket.IO 实时通信
│   │   ├── queues/        #   Celery 任务队列
│   │   ├── locales/       #   国际化资源
│   │   └── main.py        #   应用入口
│   ├── plugins/           # 业务插件（每个都是独立的 uv workspace 包）
│   │   ├── auth/          #   认证 + 角色 + 接口路由（plugin_auth）
│   │   ├── user/          #   用户管理（plugin_user）
│   │   ├── menu/          #   菜单 + 前端路由同步（plugin_menu）
│   │   ├── script/        #   脚本管理与执行（plugin_script）
│   │   ├── monitoring/    #   API 监控指标（plugin_monitoring）
│   │   ├── system/        #   系统活动日志（plugin_system）
│   │   ├── worker/        #   Celery Worker 监控（plugin_worker）
│   │   └── schedule/      #   定时任务调度（plugin_schedule）
│   ├── alembic/           # 数据库迁移（多分支）
│   └── tests/             # 集成测试
```

## 三层包结构

```
rapidkit-core  ←  rapidkit-common  ←  plugin_*
```

### 1. `rapidkit-core` — 基础设施层

独立的 Python 包（`packages/core/`），与业务完全解耦。

| 模块              | 职责                               |
| ----------------- | ---------------------------------- |
| `config.py`       | 应用配置（Mixin 拆分，环境变量）   |
| `database.py`     | 数据库引擎、会话工厂、Redis 管理器 |
| `exceptions.py`   | 全局异常定义                       |
| `status_codes.py` | 业务状态码枚举                     |
| `log.py`          | 日志配置（Loguru）                 |
| `plugin.py`       | PluginManifest 数据结构            |
| `loader.py`       | 插件加载器（拓扑排序、冲突检测）   |
| `events.py`       | EventBus 事件总线（本地 + 分布式） |
| `cache.py`        | PluginCacheManager 插件级缓存管理  |
| `i18n.py`         | 可插拔翻译函数                     |

### 2. `rapidkit-common` — 公共层

独立的 Python 包（`packages/common/`），依赖 `rapidkit-core`。

| 模块        | 职责                                                |
| ----------- | --------------------------------------------------- |
| `models.py` | SQLModel 基类（UUID7 主键、时间戳）                 |
| `crud.py`   | `BaseCRUD` 泛型 CRUD（窗口函数分页）                |
| `deps.py`   | 共享依赖（SessionDep、RedisDep）                    |
| `auth.py`   | 权限依赖抽象（UserProtocol + dependency_overrides） |
| `schemas/`  | Response、PaginatedResponse、BaseModel              |

### 3. `plugin_*` — 业务插件

每个插件是独立的 uv workspace 包，位于 `apps/backend/plugins/<name>/`。

```
plugins/<name>/
├── pyproject.toml              # 包定义，依赖 rapidkit-core + rapidkit-common
├── src/plugin_<name>/
│   ├── __init__.py             # register() → PluginManifest
│   ├── api.py                  # FastAPI 路由
│   ├── models.py               # 数据库模型
│   ├── schemas.py              # 请求/响应 Schema
│   ├── crud.py                 # CRUD 操作
│   ├── deps.py                 # 依赖注入
│   └── services.py             # 业务逻辑
├── tests/                      # 独立测试套件
└── migrations/versions/        # Alembic 分支迁移
```

#### 当前插件

| 插件                | 说明                     | 核心模型                           |
| ------------------- | ------------------------ | ---------------------------------- |
| `plugin_auth`       | 认证、角色管理、接口路由 | `User`、`Role`、`InterfaceRouter`  |
| `plugin_user`       | 用户 CRUD                | — (使用 auth 的 User)              |
| `plugin_menu`       | 菜单管理 + 前端路由同步  | `Menu`                             |
| `plugin_script`     | 脚本管理与在线执行       | `Script`、`ScriptExecution`        |
| `plugin_monitoring` | API 性能指标聚合         | `ApiMetricsHourly`                 |
| `plugin_system`     | 系统活动日志             | `ActivityLog`                      |
| `plugin_worker`     | Celery Worker 实时监控   | `CeleryWorker`、`CeleryTaskResult` |
| `plugin_schedule`   | 定时任务调度             | — (使用 queues 的模型)             |

## 插件注册机制

每个插件通过 `register()` 函数返回 `PluginManifest`，声明自身的路由、模型、依赖和生命周期回调：

```python
from rapidkit_core.plugin import PluginManifest

def register() -> PluginManifest:
    from plugin_script.api import router
    from plugin_script.models import Script, ScriptExecution

    return PluginManifest(
        name="script",
        version="0.1.0",
        router=router,
        models=[Script, ScriptExecution],
        dependencies=[],
    )
```

应用启动时，`discover_and_load_plugins()` 通过 Python Entry Points 自动发现所有已安装的插件，拓扑排序解析依赖顺序，自动注册路由到 `/api/v1/`。插件的启停通过 `plugins.toml` 配置文件控制。

详细说明参见 [插件系统](./plugin-system.md)。

## 依赖关系规则

```
rapidkit-core  ←  rapidkit-common  ←  plugin_*
                                         ↑
                                   plugin 间可声明依赖
```

1. **`rapidkit-core` 不依赖任何业务代码**
2. **`rapidkit-common` 只依赖 `rapidkit-core`**
3. **插件依赖 `rapidkit-core` 和 `rapidkit-common`**
4. **插件间可声明依赖**（如 `plugin_user` 依赖 `plugin_auth`），但必须在 `PluginManifest.dependencies` 中显式声明
5. **禁止未声明的跨插件导入**（CI 通过 AST 扫描强制执行）

## 请求处理流程

以「获取角色列表」为例：

```
客户端请求 GET /api/v1/roles
    │
    ▼
main.py → setup_router()         # 从已注册的插件路由中匹配
    │
    ▼
plugin_auth/role/api.py           # router.get("") → get_roles()
    │
    ├─→ plugin_auth/role/deps.py      # verify_user_permission（权限校验）
    ├─→ plugin_auth/role/services.py  # filter_role()（构建过滤条件）
    └─→ plugin_auth/role/crud.py      # RoleCRUD.get_paginate()
            │
            └─→ rapidkit_common/crud.py  # BaseCRUD（泛型分页实现）
```

## 跨插件通信

插件间通过类型化 **EventBus** 松耦合通信，避免直接依赖。支持本地和分布式两种模式：

```python
from rapidkit_core.events import Event, event_bus


# 定义事件
class UserLoginEvent(Event):
    user_id: int
    username: str


# 仅本地进程（如缓存失效目标是 Redis，无需跨进程）
await event_bus.async_emit(UserLoginEvent(user_id=user.id, username=user.name))

# 分布式广播（多实例部署时通知所有进程，如清除进程内缓存）
await event_bus.distributed_emit(UserLoginEvent(user_id=user.id, username=user.name))


# 订阅事件（plugin_system，通过 PluginManifest.event_listeners 声明）
def on_user_login(event: UserLoginEvent) -> None:
    ActivityService.log(event.user_id, "login")
```

详细用法参见 [插件系统 - 事件总线](./plugin-system.md#事件总线-eventbus)。

## 缓存架构

项目采用 Redis 作为缓存层，通过 `PluginCacheManager` 为每个插件提供独立的命名空间：

| 缓存类型     | Key 格式                           | 说明                     |
| ------------ | ---------------------------------- | ------------------------ |
| 插件级缓存   | `plugin:{name}:{key}`              | 菜单树、路由、页面列表等 |
| 用户信息缓存 | `auth:user:<{user_id}>`            | 登录用户数据（排除密码） |
| 权限缓存     | `auth:permission:<{user_id}>`      | 用户接口权限列表         |
| 刷新令牌     | `auth:refresh:<{user_id}>:<{jti}>` | 多设备 Refresh Token     |

缓存策略统一采用 Cache-Aside 模式：读时先查 Redis，miss 时查库并回写；写操作后主动失效缓存。

## 如何新增插件

详细步骤参见 [插件系统 - 插件开发清单](./plugin-system.md#插件开发清单)。

## 技术栈速览

| 组件     | 技术                        |
| -------- | --------------------------- |
| Web 框架 | FastAPI                     |
| ORM      | SQLModel + async SQLAlchemy |
| 数据库   | PostgreSQL（asyncpg）       |
| 缓存     | Redis                       |
| 实时通信 | Socket.IO（fastapi-sio-di） |
| 任务队列 | Celery                      |
| 主键策略 | UUID7（时间有序）           |
| 认证     | JWT（authlib）              |
| 包管理   | uv workspace                |
| 国际化   | 自定义 i18n + Babel         |

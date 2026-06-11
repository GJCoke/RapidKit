# 跨插件协作

RapidKit 的插件架构要求**插件之间零直接导入**——任何 `from plugin_x import ...` 出现在另一个插件的 `src/` 目录中都是违规的。本文档说明如何在这一约束下实现插件间协作。

## 核心原则

```text
plugin_auth/     ─┐
plugin_user/      │── 不允许互相 import
plugin_rbac/      │
plugin_menu/     ─┘
       │
       ▼
rapidkit_common/protocols/   ← 共享契约（Protocol 定义）
rapidkit_framework/services  ← 运行时服务发现
rapidkit_framework/events    ← 异步事件总线
```

选择哪种协作机制取决于交互模式：

| 场景                             | 机制                       | 示例                     |
| -------------------------------- | -------------------------- | ------------------------ |
| A 需要调用 B 的能力并等待结果    | Protocol + ServiceRegistry | auth 构建权限缓存        |
| A 发生了事件，B 可能需要响应     | EventBus                   | 角色权限变更后清用户缓存 |
| 只需简单统计，不需要完整模型语义 | Raw SQL                    | system 插件统计各表行数  |

---

## 1. Protocol + ServiceRegistry

这是最常用的跨插件协作模式，适合**请求-响应**式交互。

### 1.1 定义 Protocol

Protocol 放在 `packages/common/src/rapidkit_common/protocols/` 中，按领域分文件：

```python
# packages/common/src/rapidkit_common/protocols/user.py

from typing import Protocol, runtime_checkable
from uuid import UUID


@runtime_checkable
class UserProtocol(Protocol):
    """最小用户接口，跨插件可见。"""
    id: UUID
    username: str
    roles: list[str]


class UserResolver(Protocol):
    """解析用户身份。由 plugin_user 提供实现。"""
    async def get_by_id(self, user_id: UUID) -> UserProtocol | None: ...
    async def get_by_username(self, username: str) -> UserProtocol | None: ...
```

**命名约定：**

- 数据协议用 `XxxProtocol`（如 `UserProtocol`）
- 能力协议用动词/名词（如 `UserResolver`、`PermissionCacheManager`、`TokenDecoder`）

### 1.2 注册实现

在提供方插件的 `__init__.py` 中声明 `provides` 和 `service_factories`：

```python
# plugins/user/src/plugin_user/__init__.py

from rapidkit_common.protocols.user import UserQueryService, UserResolver
from rapidkit_framework.plugin import PluginManifest
from rapidkit_framework.services import ServiceRegistry


def register() -> PluginManifest:
    from plugin_user.api import router
    from plugin_user.models import User
    from plugin_user.services import UserQueryServiceImpl, UserResolverImpl

    def register_services(registry: ServiceRegistry) -> None:
        registry.register(UserResolver, UserResolverImpl())
        registry.register(UserQueryService, UserQueryServiceImpl())

    return PluginManifest(
        name="user",
        version="0.1.0",
        router=router,
        models=[User],
        provides=[UserResolver, UserQueryService],
        service_factories={UserResolver: register_services},
    )
```

**关键点：**

- `provides` 声明此插件对外提供的 Protocol 列表（文档化用途 + 依赖检查）
- `service_factories` 的 key 只需要填一个代表性 Protocol，value 是注册函数
- 注册函数接收 `ServiceRegistry`，调用 `registry.register(Protocol, impl)` 完成绑定
- 实现类无需显式继承 Protocol——Python 的结构化子类型（structural subtyping）自动匹配

### 1.3 消费服务

在消费方插件中使用 `get_service()` 获取实现：

```python
# plugins/auth/src/plugin_auth/auth/services.py

from rapidkit_common.protocols.rbac import PermissionCacheManager
from rapidkit_framework.services import get_service


async def user_login(user, redis):
    # 获取 rbac 插件提供的权限缓存管理器
    cache_mgr = get_service(PermissionCacheManager)
    await cache_mgr.build(user.id, user.roles, redis)
```

**注意事项：**

- `get_service()` 在服务未注册时抛出 `RuntimeError`，确保 `dependencies` 声明正确
- 可用 `get_service_optional()` 获取可选依赖（返回 `None` 而非抛异常）
- 确保消费方插件在 `PluginManifest.dependencies` 中声明了提供方（保证加载顺序）

### 1.4 实现类中的 DB 访问

当 Protocol 实现需要数据库访问，但不在 FastAPI 请求上下文中时，使用 `AsyncSessionLocal` 自管理会话：

```python
from rapidkit_core.database import AsyncSessionLocal


class PermissionCacheManagerImpl:
    async def build(self, user_id, roles, redis):
        async with AsyncSessionLocal() as session:
            # 在自管理的 session 中执行查询
            crud = RoleCRUD(session)
            ...
```

---

## 2. EventBus（事件驱动式协作）

适合**发布-订阅**式交互：发布者不关心谁在监听，监听者不需要返回结果。

### 2.1 定义事件

事件类放在 `packages/common/src/rapidkit_common/events/` 中：

```python
# packages/common/src/rapidkit_common/events/rbac.py

from dataclasses import dataclass
from typing import ClassVar

from rapidkit_framework.events import Event


@dataclass
class RolePermissionsChangedEvent(Event):
    """角色权限变更后触发，消费者应清理相关缓存。"""

    event_name: ClassVar[str] = "role.permissions_changed"
    role_code: str
```

**约定：**

- `event_name` 使用 `{domain}.{action}` 格式（如 `role.permissions_changed`）
- 事件类继承 `Event`，使用 `@dataclass` 声明字段

### 2.2 发射事件

在产生事件的插件中：

```python
from rapidkit_common.events import RolePermissionsChangedEvent
from rapidkit_framework.events import event_bus

# 角色权限更新后发射事件
await event_bus.async_emit(
    RolePermissionsChangedEvent(role_code=role.code),
    source="rbac",
)
```

- `source` 标识事件来源（便于调试和过滤）
- `async_emit` 是 fire-and-forget，不阻塞当前请求
- 跨实例广播用 `distributed_emit`（通过 Redis pub/sub）

### 2.3 监听事件

**方式一：声明式（推荐）**

在 `PluginManifest.event_listeners` 中注册：

```python
# plugins/user/src/plugin_user/__init__.py

async def _on_role_permissions_changed(event: RolePermissionsChangedEvent) -> None:
    """角色权限变更时清理受影响用户的缓存。"""
    from rapidkit_core.database import AsyncSessionLocal, RedisManager
    from plugin_user.services import invalidate_users_by_role_code

    redis = RedisManager.client()
    async with AsyncSessionLocal() as session:
        await invalidate_users_by_role_code(redis, event.role_code, session)


def register() -> PluginManifest:
    return PluginManifest(
        ...
        event_listeners=[(RolePermissionsChangedEvent, _on_role_permissions_changed)],
    )
```

**方式二：命令式**

在 `on_startup` 回调中手动注册（适合需要 priority 或 allowed_sources 的场景）：

```python
async def _startup(app):
    event_bus.on(
        RolePermissionsChangedEvent,
        _on_role_permissions_changed,
        priority=10,                    # 数字越小越先执行
        allowed_sources=["rbac"],       # 只接受来自 rbac 的事件
    )
```

**方式三：通配符**

```python
event_bus.on_pattern("role.*", _on_any_role_event)
```

### 2.4 事件处理器注意事项

- 处理器内**不要**假设 FastAPI 请求上下文存在，需要 DB/Redis 时自行创建
- 处理器失败不会影响发射方，错误记录在 `event_bus.handler_errors`
- 未被任何处理器消费的事件进入死信队列（`event_bus.dead_letters`，最多 100 条）

---

## 3. Raw SQL（轻量数据读取）

当一个插件只需要另一个插件的数据统计，且不需要完整的 ORM 语义时，可以通过约定的表名直接查询：

```python
# plugins/system/src/plugin_system/api.py

from sqlalchemy import text

async def _count(table: str) -> int:
    result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
    return result.scalar_one()

roles = await _count("rbac_roles")
menus = await _count("menu_menus")
```

**适用条件：**

- 只读、只聚合（COUNT/SUM/AVG）
- 不需要 model 的业务方法
- 表名遵循 `{plugin}_{entity_plural}` 命名约定，视为稳定 API

**不适用时改用 ServiceRegistry：**

- 需要 model 实例及其方法
- 需要写操作
- 查询逻辑可能变更

---

## 禁止事项

| 做法                                            | 为什么不行       | 替代方案                           |
| ----------------------------------------------- | ---------------- | ---------------------------------- |
| `from plugin_rbac.role.deps import RoleCrudDep` | 直接依赖内部实现 | 定义 Protocol + ServiceRegistry    |
| `from plugin_user.models import User`           | 耦合 ORM 模型    | 使用 `UserProtocol` 或 raw SQL     |
| 在 Service 层 import 其他插件的 CRUD            | 跨越边界         | Protocol 方法封装所需能力          |
| 通过 `app.state` 传递插件内部对象               | 隐式耦合         | ServiceRegistry 显式注册           |
| 在 Protocol 中暴露 SQLModel/Session             | 泄露实现         | Protocol 参数用基础类型或 Protocol |

---

## 决策流程

```text
需要跨插件交互？
  │
  ├─ 需要调用并等结果？
  │   └── Protocol + ServiceRegistry
  │
  ├─ 只是通知，不需要结果？
  │   └── EventBus
  │
  ├─ 只需简单统计数字？
  │   └── Raw SQL (表名约定)
  │
  └─ 需要数据类型共享？
      └── 在 rapidkit_common/protocols/ 定义 Protocol
```

---

## 现有 Protocol 清单

| Protocol                 | 所在文件                  | 提供者            | 消费者                   |
| ------------------------ | ------------------------- | ----------------- | ------------------------ |
| `UserProtocol`           | `protocols/user.py`       | — (数据契约)      | auth, rbac               |
| `UserResolver`           | `protocols/user.py`       | plugin_user       | plugin_auth, plugin_rbac |
| `UserQueryService`       | `protocols/user.py`       | plugin_user       | plugin_rbac              |
| `TokenDecoder`           | `protocols/auth.py`       | plugin_auth       | plugin_rbac              |
| `Authenticator`          | `protocols/auth.py`       | plugin_auth       | —                        |
| `CurrentUserProvider`    | `protocols/auth.py`       | plugin_auth       | —                        |
| `PasswordDecryptor`      | `protocols/auth.py`       | plugin_auth       | plugin_user              |
| `PermissionChecker`      | `protocols/rbac.py`       | plugin_rbac       | —                        |
| `PolicyLoader`           | `protocols/rbac.py`       | plugin_rbac       | —                        |
| `PermissionCacheManager` | `protocols/rbac.py`       | plugin_rbac       | plugin_auth, plugin_menu |
| `DepartmentResolver`     | `protocols/department.py` | plugin_department | —                        |

---

## 添加新 Protocol 的步骤

1. 在 `packages/common/src/rapidkit_common/protocols/` 中创建或追加 Protocol 定义
2. 在 `protocols/__init__.py` 中导出（可选，便于 barrel import）
3. 提供方插件实现该 Protocol，在 `__init__.py` 的 `provides` 和 `service_factories` 中注册
4. 消费方插件通过 `get_service(Protocol)` 使用，并在 `dependencies` 中声明提供方
5. 运行 `uv run ty check` 确保类型匹配

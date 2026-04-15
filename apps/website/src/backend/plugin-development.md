# 插件开发指南

## 快速开始

使用 CLI 脚手架命令创建新插件：

```bash
rapidkit create-plugin
# 或直接指定名称
rapidkit create-plugin --name notification
```

生成的目录结构：

```
apps/backend/plugins/notification/
├── pyproject.toml
├── src/plugin_notification/
│   ├── __init__.py        # register() 入口
│   ├── api.py             # 路由定义
│   ├── schemas.py         # Pydantic schemas
│   ├── models.py          # SQLModel 模型
│   ├── services.py        # 业务逻辑
│   └── crud.py            # 数据库操作
├── tests/
│   ├── conftest.py        # 测试环境变量
│   └── test_register.py   # 注册测试
└── migrations/
    └── versions/          # Alembic 迁移文件
```

## register() 函数

每个插件必须在 `__init__.py` 中导出 `register()` 函数：

```python
from rapidkit_core.plugin import PluginManifest

def register() -> PluginManifest:
    from plugin_notification.api import router
    from plugin_notification.models import Notification

    return PluginManifest(
        name="notification",
        version="0.1.0",
        router=router,
        models=[Notification],
        dependencies=["auth"],
        on_startup=[init_channels],
        on_shutdown=[close_channels],
        event_listeners=[("user.created", on_user_created)],
    )
```

完整字段参考见 [插件系统 - PluginManifest](./plugin-system.md#pluginmanifest)。

:::warning models 列表必须完整
`models` 列表必须包含插件定义的**所有** SQLModel 模型类，否则 Alembic 无法发现对应的表结构变更。漏掉一个模型 = 这张表不会出现在自动生成的迁移中。
:::

:::danger register() 内使用延迟导入
注意 `router` 和 `models` 的导入放在 `register()` 函数体内部（延迟导入），而不是模块顶层。这避免了在插件尚未完全初始化时触发循环导入。**所有 `register()` 内的项目导入都应该是延迟导入。**

```python
# ✅ 正确 — 延迟导入
def register() -> PluginManifest:
    from plugin_notification.api import router
    return PluginManifest(router=router, ...)

# ❌ 错误 — 顶层导入可能导致循环依赖
from plugin_notification.api import router  # 可能失败！
def register() -> PluginManifest:
    return PluginManifest(router=router, ...)
```

唯一的例外是 `models` — 如果模型类不会触发循环导入（纯数据定义），可以在顶层导入。
:::

## 导入约定

### 基础设施和公共模块

```python
# 核心基础设施（rapidkit-core）
from rapidkit_core.config import settings
from rapidkit_core.exceptions import AppException
from rapidkit_core.status_codes import StatusCode
from rapidkit_core.log import logger
from rapidkit_core.database import AsyncSessionLocal, RedisManager
from rapidkit_core.events import event_bus
from rapidkit_core.timezone import timezone

# 公共模块（rapidkit-common）
from rapidkit_common.models import SQLModel
from rapidkit_common.crud import BaseSQLModelCRUD
from rapidkit_common.deps import SessionDep, RedisDep
from rapidkit_common.schemas.response import Response, PaginatedResponse
from rapidkit_common.auth import verify_user_permission, UserDBDep
```

### 插件内部导入

使用 workspace 包名，不要使用相对导入：

```python
# ✅ 正确 — 使用包名
from plugin_notification.models import Notification
from plugin_notification.crud import NotificationCRUD

# ❌ 错误 — 不要使用相对导入
from .models import Notification
```

### TYPE_CHECKING 模式

当需要类型注解但不想在运行时导入（避免循环导入或引入重型依赖）时：

```python
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

async def my_startup(app: FastAPI) -> None:
    ...
```

:::warning `from __future__ import annotations` 必须在文件第一行
如果使用 `TYPE_CHECKING` 模式，`from __future__ import annotations` 必须在文件最顶部（docstring 之后），否则类型注解会在运行时求值并报错。
:::

## 跨插件依赖规则

跨插件导入分两类，处理方式不同：

### 读依赖（查询数据）— 使用 dependencies 声明

当插件需要导入另一个插件的模型、CRUD、Schema 等时，在 `dependencies` 中声明：

```python
# plugin_menu 需要读取 plugin_auth 的 User 模型和 RoleCRUD
def register() -> PluginManifest:
    return PluginManifest(
        name="menu",
        dependencies=["auth"],  # 声明后可以直接导入 plugin_auth
        ...
    )

# plugin_menu/route_services.py — 合法导入
from plugin_auth.auth.models import User
from plugin_auth.role.crud import RoleCRUD
```

### 写依赖（触发副作用）— 使用 EventBus

当插件需要触发另一个插件的业务动作时（如登录后记录活动日志），使用事件总线解耦：

```python
# ❌ 避免 — 直接导入产生紧耦合
from plugin_system.services import ActivityService
ActivityService.log_activity_fire_and_forget(event_type="user_login", ...)

# ✅ 推荐 — 通过事件总线解耦
from rapidkit_core.events import event_bus
event_bus.emit("activity.log", {
    "event_type": "user_login",
    "params": {"name": username},
    "sio": request.app.state.socket,
}, source="auth")
```

### 判断标准

| 场景                       | 方式                      | 示例                                                          |
| -------------------------- | ------------------------- | ------------------------------------------------------------- |
| 读取模型/Schema            | `dependencies` + 直接导入 | `from plugin_auth.auth.models import User`                    |
| 使用 CRUD/deps             | `dependencies` + 直接导入 | `from plugin_auth.role.deps import RoleCrudDep`               |
| 触发日志、通知等副作用     | EventBus `emit()`         | `event_bus.emit("activity.log", ...)`                         |
| 缓存失效等需要等待的副作用 | EventBus `async_emit()`   | `await event_bus.async_emit("role.permissions_changed", ...)` |

:::danger 未声明的跨插件导入是禁止的
在 `dependencies` 中没有声明的插件，不允许使用 `from plugin_xxx import ...`。CI 的 AST 扫描会自动检测违规导入。
:::

## EventBus 实战

### 通过 PluginManifest 注册监听器（推荐）

在 `register()` 中通过 `event_listeners` 字段声明，加载器会自动注册到全局 EventBus：

```python
# plugin_system/__init__.py

def _on_activity_event(data: dict) -> None:
    """同步 handler — 内部使用 asyncio.create_task 异步化。"""
    from plugin_system.services import ActivityService
    ActivityService.log_activity_fire_and_forget(**data)

def register() -> PluginManifest:
    return PluginManifest(
        name="system",
        event_listeners=[("activity.log", _on_activity_event)],
        ...
    )
```

### 异步监听器

当业务逻辑需要 `await`（如操作 Redis、数据库）时，handler 必须是 `async` 函数，触发时使用 `async_emit()`：

```python
# plugin_user/__init__.py

async def _on_role_permissions_changed(data: dict) -> None:
    from plugin_user.services import invalidate_users_by_role_code
    await invalidate_users_by_role_code(data["redis"], data["role_code"], data["session"])

def register() -> PluginManifest:
    return PluginManifest(
        name="user",
        event_listeners=[("role.permissions_changed", _on_role_permissions_changed)],
        ...
    )
```

### 发布事件

```python
from rapidkit_core.events import event_bus

# 同步发布 — handler 内部 fire-and-forget，不需要等待
event_bus.emit("activity.log", {
    "event_type": "user_login",
    "params": {"name": body.username},
    "sio": request.app.state.socket,
}, source="auth")

# 异步发布 — 需要等待 handler 完成（如缓存失效）
await event_bus.async_emit("role.permissions_changed", {
    "redis": redis,
    "role_code": role.code,
    "session": session,
}, source="auth")
```

### emit vs async_emit 选择

| 方法           | handler 支持        | 典型场景                           |
| -------------- | ------------------- | ---------------------------------- |
| `emit()`       | 仅同步 handler      | 活动日志（内部自行 `create_task`） |
| `async_emit()` | 同步 + 异步 handler | 缓存失效、必须在响应前完成的操作   |

:::danger emit() 会跳过 async handler
如果你注册了 `async def handler(data)` 但用 `emit()`（同步）触发，该 handler 会被**静默跳过**，只在日志中输出一条 warning。这是一个常见的 bug 来源 — 请确保 handler 类型与触发方式一致。
:::

:::warning handler 异常不会中断其他 handler
EventBus 会捕获每个 handler 的异常并记录日志，然后继续执行后续 handler。这意味着你**不能**依赖异常来中断事件传播。如果业务逻辑需要事务性保证，不要使用 EventBus。
:::

### 现有事件清单

| 事件名                     | data 结构                                         | 发布方       | 监听方 | 触发方式               |
| -------------------------- | ------------------------------------------------- | ------------ | ------ | ---------------------- |
| `activity.log`             | `{event_type, params, detail?, sio?, source_ip?}` | auth, worker | system | `emit()`（同步）       |
| `role.permissions_changed` | `{redis, role_code, session}`                     | auth         | user   | `async_emit()`（异步） |

## 生命周期回调

### on_startup

应用启动时执行，接收 `FastAPI` 实例。适合创建后台任务、初始化连接等：

```python
from __future__ import annotations
import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []

async def _startup(app: FastAPI) -> None:
    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_loop(socket)))

async def _shutdown(app: FastAPI) -> None:
    for t in _tasks:
        t.cancel()
    _tasks.clear()
```

:::warning 后台任务必须在 on_shutdown 中取消
如果在 `on_startup` 中创建了 `asyncio.Task`，必须在 `on_shutdown` 中 `cancel()` 它们。否则应用关闭时会报 `Task was destroyed but it is pending!` 警告，甚至导致关闭挂起。
:::

:::danger 不要在 on_startup 中阻塞
`on_startup` 回调在应用接受请求之前执行。如果回调中有长时间阻塞的操作，会延迟应用启动。对于持续运行的任务，使用 `asyncio.create_task()` 把它放到后台。
:::

### 可用的 app.state 属性

在 `on_startup` 回调中，以下属性已经可用：

| 属性                   | 条件                         | 类型                   |
| ---------------------- | ---------------------------- | ---------------------- |
| `app.state.socket`     | 始终可用                     | `socketio.AsyncServer` |
| `app.state.celery_app` | `ENABLE_CELERY_MONITOR=true` | `Celery`               |
| `app.state.plugins`    | 始终可用                     | `list[PluginManifest]` |
| `app.state.limiter`    | 始终可用                     | `Limiter`              |

### 在 API 端点中访问 app.state

通过 `Request` 对象访问：

```python
from fastapi import Request

@router.post("/trigger")
async def trigger_task(request: Request, body: TriggerTaskRequest):
    celery_app = request.app.state.celery_app
    socket = request.app.state.socket
    ...
```

:::warning 不要在模块顶层缓存 app.state

```python
# ❌ 错误 — 模块加载时 app 还没创建
from src.main import app
socket = app.state.socket  # AttributeError!

# ✅ 正确 — 在函数内通过参数访问
async def my_endpoint(request: Request):
    socket = request.app.state.socket
```

:::

## 模型定义

使用 `rapidkit_common.models.SQLModel` 作为基类：

```python
from rapidkit_common.models import SQLModel
from sqlmodel import Field

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    title: str = Field(max_length=200, description="通知标题")
    content: str = Field(description="通知内容")
    is_read: bool = Field(default=False, description="是否已读")
```

基类已提供 `id`（UUID7）、`create_time`、`update_time` 字段。

:::warning **tablename** 必须显式声明
不要依赖 SQLModel 的自动表名推断。显式声明 `__tablename__` 确保迁移和数据库操作使用预期的表名。建议使用插件名前缀避免冲突，如 `notifications` 而不是 `notification`。
:::

:::danger 模型定义在正确的插件中
每个模型只应定义在**一个**插件中，其他插件通过 `dependencies` 声明后导入。不要在多个插件中定义操作同一张表的模型。例如 `User` 模型定义在 `plugin_auth` 中，`plugin_user`（用户管理）通过 `dependencies=["auth"]` 导入它。
:::

## 数据库迁移

插件的迁移文件存放在 `plugins/<name>/migrations/versions/` 目录，使用 Alembic 多分支策略。

### 生成初始迁移

```bash
cd apps/backend
uv run alembic revision --autogenerate \
  --branch-label=notification \
  -m "add notification table" \
  --version-path plugins/notification/migrations/versions/
```

### 后续迁移

```bash
uv run alembic revision --autogenerate \
  --head=notification@head \
  -m "add notification_settings table" \
  --version-path plugins/notification/migrations/versions/
```

### 执行迁移

```bash
# 全部分支
uv run alembic upgrade heads

# 仅特定插件
uv run alembic upgrade notification@head

# 回退特定插件
uv run alembic downgrade notification@-1
```

:::danger branch-label 必须唯一
每个插件的 `--branch-label` 必须唯一且与插件名一致。如果两个插件使用了相同的 branch-label，Alembic 会报 `Multiple heads` 错误。
:::

:::warning 初始迁移只用 --branch-label，后续迁移用 --head
初次迁移使用 `--branch-label=xxx` 创建新分支。后续迁移必须使用 `--head=xxx@head` 追加到已有分支。如果后续迁移还用 `--branch-label`，会创建一个新的孤立分支。
:::

:::warning alembic/env.py 中也要注册模型
除了 `PluginManifest.models` 之外，`alembic/env.py` 中的 `PLUGIN_MODULES` 列表也必须包含你的插件名，否则 `--autogenerate` 无法发现新模型的表结构：

```python
# alembic/env.py
PLUGIN_MODULES = [
    "plugin_auth",
    "plugin_script",
    ...,
    "plugin_notification",  # 不要忘记这里！
]
```

:::

## 路由与权限

```python
from fastapi import APIRouter, Depends, Request
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import SessionDep, RedisDep
from rapidkit_common.schemas.response import Response

router = APIRouter(
    prefix="/notification",
    tags=["Notification"],
    dependencies=[Depends(verify_user_permission)],  # 整个路由组需要权限验证
)

@router.get("")
async def list_notifications(session: SessionDep) -> Response:
    ...

@router.post("/{notification_id}/read")
async def mark_as_read(
    request: Request,  # 需要访问 app.state 时添加
    notification_id: UUID,
    session: SessionDep,
) -> Response:
    socket = request.app.state.socket
    ...
```

:::warning verify_user_permission vs VerifyPermissionDep

- `verify_user_permission` — 函数，用于 `dependencies=[Depends(verify_user_permission)]`（路由组级别）
- `VerifyPermissionDep` — 带 `Annotated` 的依赖类型，用于单个端点参数

两者效果相同，选择取决于你要在路由组级别还是单个端点级别应用权限检查。
:::

## 测试

每个插件自带独立测试套件：

```bash
# 运行单个插件测试
uv run pytest apps/backend/plugins/notification/tests/ -v

# 运行全部后端测试
uv run pytest apps/backend/tests/ -v
```

### 必备测试

每个插件至少包含：

1. **test_register** — `register()` 返回正确的 `PluginManifest`
2. **test_router_exists** — router 不为 None
3. **test_models_registered** — models 列表包含所有模型类

```python
# tests/test_register.py
class TestPluginRegister:
    def test_register_returns_manifest(self):
        from plugin_notification import register
        manifest = register()
        assert isinstance(manifest, PluginManifest)
        assert manifest.name == "notification"

    def test_router_exists(self):
        from plugin_notification import register
        manifest = register()
        assert manifest.router is not None

    def test_models_registered(self):
        from plugin_notification import register
        from plugin_notification.models import Notification
        manifest = register()
        assert Notification in manifest.models
```

## 注册新插件

创建插件后，需要完成以下手动步骤：

### 1. 添加工作区依赖

根 `pyproject.toml`：

```toml
dependencies = [..., "rapidkit-plugin-notification"]

[tool.uv.sources]
rapidkit-plugin-notification = { workspace = true }
```

`apps/backend/pyproject.toml`：

```toml
dependencies = [..., "rapidkit-plugin-notification"]

[tool.uv.sources]
rapidkit-plugin-notification = { workspace = true }
```

### 2. 注册到插件加载列表

`apps/backend/src/main.py`：

```python
PLUGIN_MODULES: list[str] = [
    ...
    "plugin_notification",
]
```

### 3. 配置迁移路径

`apps/backend/alembic.ini` — 在 `version_locations` 末尾追加：

```
:plugins/notification/migrations/versions
```

`apps/backend/alembic/env.py` — 在 `PLUGIN_MODULES` 列表中追加：

```python
"plugin_notification",
```

### 4. 安装依赖

```bash
uv sync
```

### 5. 添加 CODEOWNERS

`.github/CODEOWNERS`：

```
apps/backend/plugins/notification/   @rapidkit/notification-team
```

### 6. 验证

```bash
uv run pytest apps/backend/plugins/notification/tests/ -v
```

:::danger 忘记任何一步都会导致问题
最常见的遗漏：

| 遗漏步骤               | 症状                                           |
| ---------------------- | ---------------------------------------------- |
| pyproject.toml 未添加  | `uv sync` 后 `import plugin_notification` 失败 |
| main.py 未注册         | 应用启动正常但插件路由 404                     |
| alembic.ini 未添加路径 | `alembic revision` 报路径不存在                |
| alembic/env.py 未注册  | `--autogenerate` 不会检测模型变更              |
| `uv sync` 未执行       | IDE 报找不到模块，测试 import 失败             |

:::

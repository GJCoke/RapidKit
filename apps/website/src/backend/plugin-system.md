# 插件系统

## 概述

RapidKit 后端采用插件化架构，基于 Python [Entry Points](https://packaging.python.org/en/latest/specifications/entry-points/) 实现插件自动发现，通过 `plugins.toml` 配置文件控制启停。

核心能力：

- **路由注册** — 插件声明 `APIRouter`，框架自动挂载到 `/api/v1/`
- **依赖注入** — 通过 `dependency_overrides` 覆盖核心占位依赖
- **中间件声明** — 插件可声明自定义中间件，按 `order` 排序挂载
- **事件总线** — 类型化 `EventBus` 实现跨插件松耦合通信
- **生命周期回调** — `on_startup` / `on_shutdown` 按拓扑序执行
- **健康检查** — 插件声明健康检查函数，框架聚合后统一暴露
- **版本约束** — PEP 440 语义化版本约束，不满足时阻止启动或跳过
- **故障隔离** — 非必要插件失败自动跳过，级联依赖自动处理

架构流程：

```text
插件 → register() → PluginManifest
                        ↓
              loader（发现 → 过滤 → 版本校验 → 拓扑排序 → 注册）
                        ↓
                    FastAPI app
```

## 快速开始

5 分钟创建你的第一个插件。

### 1. 创建目录结构

```text
apps/backend/plugins/hello/
├── pyproject.toml
└── src/plugin_hello/
    ├── __init__.py
    └── api.py
```

### 2. 编写 pyproject.toml

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.backends"

[project]
name = "plugin-hello"
version = "0.1.0"
dependencies = ["rapidkit-core"]

[project.entry-points."rapidkit.plugins"]
hello = "plugin_hello:register"
```

关键配置：`[project.entry-points."rapidkit.plugins"]` 声明了插件的 entry point，`hello` 是插件名，`plugin_hello:register` 指向注册函数。

### 3. 实现注册函数

```python
# plugins/hello/src/plugin_hello/__init__.py
from rapidkit_core.plugin import PluginManifest

from plugin_hello.api import router


def register() -> PluginManifest:
    return PluginManifest(name="hello", version="0.1.0", router=router)
```

### 4. 定义路由

```python
# plugins/hello/src/plugin_hello/api.py
from fastapi import APIRouter

router = APIRouter(prefix="/hello", tags=["Hello"])


@router.get("/greet")
async def greet():
    return {"message": "Hello from plugin!"}
```

### 5. 安装并运行

```bash
uv add --editable plugins/hello
# 插件自动被发现并加载，访问 /api/v1/hello/greet
```

## 核心概念

### 插件清单（PluginManifest）

每个插件通过 `register()` 函数返回 `PluginManifest`，声明自身的元数据和能力：

```python
from rapidkit_core.plugin import MiddlewareDef, PluginDependency, PluginManifest


def register() -> PluginManifest:
    return PluginManifest(
        name="example",
        version="0.1.0",
        router=router,
        models=[MyModel],
        dependencies=[PluginDependency(name="system", version=">=1.0.0")],
        permissions=["example:read", "example:write"],
        required=True,
        on_startup=[init_resources],
        on_shutdown=[cleanup_resources],
        event_listeners=[(MyEvent, on_my_event, 0)],
        dependency_overrides={placeholder_fn: real_fn},
        middlewares=[MiddlewareDef(cls=MyMiddleware, kwargs={}, order=10)],
    )
```

#### 完整字段参考

| 字段                   | 类型                                   | 默认值 | 说明                                          |
| ---------------------- | -------------------------------------- | ------ | --------------------------------------------- |
| `name`                 | `str`                                  | 必填   | 插件唯一标识，小写                            |
| `version`              | `str`                                  | 必填   | 语义化版本号                                  |
| `router`               | `APIRouter \| None`                    | `None` | 插件路由，自动注册到 `/api/v1/`               |
| `models`               | `list[type]`                           | `[]`   | SQLModel 模型类，供 Alembic 自动发现          |
| `dependencies`         | `list[str \| PluginDependency]`        | `[]`   | 依赖的其他插件，支持版本约束                  |
| `permissions`          | `list[str]`                            | `[]`   | 插件声明的权限标识                            |
| `required`             | `bool`                                 | `True` | 加载失败是否阻止应用启动                      |
| `on_startup`           | `list[Callable[[FastAPI], Coroutine]]` | `[]`   | 应用启动时的异步回调                          |
| `on_shutdown`          | `list[Callable[[FastAPI], Coroutine]]` | `[]`   | 应用关闭时的异步回调                          |
| `event_listeners`      | `list[tuple]`                          | `[]`   | 事件监听器 `(EventType, handler[, priority])` |
| `dependency_overrides` | `dict[Callable, Callable]`             | `{}`   | FastAPI 依赖注入覆盖                          |
| `middlewares`          | `list[MiddlewareDef]`                  | `[]`   | 插件中间件声明                                |

:::danger register() 内使用延迟导入
`router` 和 `models` 的导入应放在 `register()` 函数体内部（延迟导入），避免在插件尚未完全初始化时触发循环导入：

```python
# ✅ 正确 — 延迟导入
def register() -> PluginManifest:
    from plugin_hello.api import router

    return PluginManifest(router=router, ...)

# ❌ 错误 — 顶层导入可能导致循环依赖
from plugin_hello.api import router

def register() -> PluginManifest:
    return PluginManifest(router=router, ...)
```

:::

### 插件发现机制

插件加载分两层：

**1. Entry Points 自动发现**

在 `pyproject.toml` 中声明 entry point 后，安装的插件会被 loader 通过 `importlib.metadata.entry_points(group="rapidkit.plugins")` 自动发现。不需要在任何列表中手动注册。

**2. plugins.toml 配置过滤**

`apps/backend/plugins.toml` 用于控制插件的启用/禁用：

```toml
[plugins]
auth = true
hello = false              # 禁用此插件
debug = "${ENABLE_DEBUG:false}"  # 从环境变量读取，默认 false
```

- 未在 `plugins.toml` 中列出的插件默认启用
- 支持环境变量展开：`${VAR_NAME:default_value}`
- 配置文件不存在时，所有已安装插件全部启用

**Loader 完整流程：**

```text
发现 entry points → plugins.toml 过滤 → 调用 register()
→ 版本约束校验 → 拓扑排序 → 注册事件监听器 → 返回 PluginLoadResult
```

### 依赖管理与拓扑排序

插件通过 `dependencies` 字段声明对其他插件的依赖关系：

```python
# 简单字符串依赖（无版本要求）
dependencies = ["system", "user"]

# 带版本约束（PEP 440）
from rapidkit_core.plugin import PluginDependency

dependencies = [
    PluginDependency(name="system", version=">=1.0.0"),
    "user",  # 混合使用也可以
]
```

Loader 使用 Kahn 算法对插件进行拓扑排序，确保被依赖的插件先加载。检测到以下问题时会抛出 `PluginLoadError`：

- **循环依赖** — A 依赖 B，B 依赖 A
- **缺失依赖** — 声明了依赖但目标插件未安装
- **重复名称** — 两个插件使用了相同的 `name`

#### 现有插件依赖关系

```text
auth ─────────┬──────────────────────┐
              │                      │
         menu (auth)            script (无依赖)
              │                      │
         system (auth, menu, script) │
              │                      │
         user (auth, system)         │
                                     │
monitoring (无依赖)    schedule (无依赖)    worker (无依赖)
```

加载顺序：`auth → script → monitoring → schedule → worker → menu → system → user`

## 路由与 API

插件通过 `PluginManifest.router` 声明路由，框架在启动时自动收集并挂载到 `v1_router`（带 `API_PREFIX_V1` 前缀）。

### 基本路由

```python
from fastapi import APIRouter

router = APIRouter(prefix="/hello", tags=["Hello"])


@router.get("/greet")
async def greet():
    return {"message": "Hello!"}


@router.post("/echo")
async def echo(data: dict):
    return data
```

最终访问路径为 `{API_PREFIX_V1}/hello/greet`，例如 `/api/v1/hello/greet`。

### 多模块路由

大型插件可拆分为多个路由文件，在 `__init__.py` 中合并：

```python
# plugin_auth/__init__.py
from plugin_auth.auth.api import router as auth_router
from plugin_auth.role.api import router as role_router

main_router = APIRouter()
main_router.include_router(auth_router)
main_router.include_router(role_router)


def register() -> PluginManifest:
    return PluginManifest(name="auth", version="0.1.0", router=main_router)
```

### 路由权限保护

```python
from fastapi import APIRouter, Depends
from rapidkit_common.auth import verify_user_permission
from rapidkit_common.deps import SessionDep
from rapidkit_common.schemas.response import Response

router = APIRouter(
    prefix="/notification",
    tags=["Notification"],
    dependencies=[Depends(verify_user_permission)],  # 整个路由组需要权限
)


@router.get("")
async def list_notifications(session: SessionDep) -> Response:
    ...
```

## 依赖注入

### dependency_overrides

`rapidkit-common` 中定义占位依赖函数，插件通过 `dependency_overrides` 提供真实实现。这样其他插件可以使用共享依赖而不直接依赖具体插件：

```python
# packages/common — 定义占位符
async def _verify_user_permission_placeholder():
    raise NotImplementedError("No auth plugin installed")


VerifyPermissionDep = Annotated[None, Depends(_verify_user_permission_placeholder)]
```

```python
# plugin_auth — 覆盖为真实实现
from rapidkit_common.auth import _verify_user_permission_placeholder
from plugin_auth.auth.deps import verify_user_permission


def register() -> PluginManifest:
    return PluginManifest(
        name="auth",
        version="0.1.0",
        dependency_overrides={
            _verify_user_permission_placeholder: verify_user_permission,
        },
    )
```

覆盖按拓扑序应用 — 后加载的插件可以覆盖先加载插件的实现。

### app.state 共享资源

共享资源通过 `app.state` 挂载，插件在运行时通过 `Request` 或生命周期回调访问：

| 属性                   | 条件                         | 类型                   |
| ---------------------- | ---------------------------- | ---------------------- |
| `app.state.socket`     | 始终可用                     | `socketio.AsyncServer` |
| `app.state.celery_app` | `ENABLE_CELERY_MONITOR=true` | `Celery`               |
| `app.state.plugins`    | 始终可用                     | `list[PluginManifest]` |
| `app.state.limiter`    | 始终可用                     | `Limiter`              |

```python
# 在 API 端点中访问
@router.post("/trigger")
async def trigger_task(request: Request):
    celery_app = request.app.state.celery_app
    socket = request.app.state.socket


# 在 on_startup 回调中访问
async def _startup(app: FastAPI) -> None:
    socket = app.state.socket
```

:::warning 不要在模块顶层访问 app.state
`app.state` 在应用创建后才可用。始终通过函数参数传递：

```python
# ❌ 错误
from src.main import app

socket = app.state.socket  # AttributeError!

# ✅ 正确
async def my_endpoint(request: Request):
    socket = request.app.state.socket
```

:::

## 中间件

插件可通过 `MiddlewareDef` 声明自定义中间件：

```python
from rapidkit_core.plugin import MiddlewareDef

middlewares = [
    MiddlewareDef(
        cls=AuditLogMiddleware,
        kwargs={"log_body": True},
        order=10,  # 数值越小越靠近请求入口
    ),
]
```

### MiddlewareDef 字段

| 字段     | 类型   | 默认值 | 说明                             |
| -------- | ------ | ------ | -------------------------------- |
| `cls`    | `type` | 必填   | 中间件类                         |
| `kwargs` | `dict` | `{}`   | 传递给中间件构造函数的参数       |
| `order`  | `int`  | `0`    | 挂载顺序，数值越小越靠近请求入口 |

### 挂载规则

Starlette 中间件栈采用 LIFO（后挂载的更靠外）。Loader 按 `order` 降序挂载，因此 **order 值小的最终更靠近请求入口**。同 `order` 时按插件拓扑序决定位置。

插件中间件在全局中间件（CORS、Logger、I18n 等）之后注册，即更靠近业务层：

```text
请求 → CORS → LoggerMiddleware → I18nMiddleware → ...
     → [插件中间件 order=0] → [插件中间件 order=10] → 路由处理
```

## 事件总线（EventBus）

跨插件通信通过 `rapidkit_core.events.event_bus` 全局单例实现松耦合。EventBus 使用类型化事件，支持优先级控制和可观测性。

### 定义事件

事件继承自 `Event` 基类：

```python
from rapidkit_core.events import Event


class UserCreatedEvent(Event):
    user_id: int
    username: str


class RolePermissionsChangedEvent(Event):
    role_code: str
    redis: object
    session: object
```

### 订阅事件

**方式一：通过 `event_listeners` 声明（推荐）**

在 `register()` 中声明，加载器按拓扑序自动注册到全局 EventBus：

```python
def on_user_created(event: UserCreatedEvent):
    print(f"New user: {event.username}")


async def on_user_created_async(event: UserCreatedEvent):
    await notify_admin(event.user_id)


def register() -> PluginManifest:
    return PluginManifest(
        name="notification",
        version="0.1.0",
        event_listeners=[
            (UserCreatedEvent, on_user_created),          # 默认优先级 0
            (UserCreatedEvent, on_user_created_async, 0), # 显式指定优先级
        ],
    )
```

`priority` 数字越小越先执行，默认为 0。

**方式二：直接调用 `event_bus`（动态注册场景）**

```python
from rapidkit_core.events import event_bus

event_bus.on(UserCreatedEvent, on_user_created, priority=0)
```

### 发布事件

```python
from rapidkit_core.events import event_bus

# 异步发布 — 等待所有 handler 执行完毕
await event_bus.async_emit(UserCreatedEvent(user_id=1, username="alice"))

# Fire-and-forget — 不阻塞当前请求
event_bus.fire_and_forget(UserCreatedEvent(user_id=1, username="alice"))
```

### 跨插件通信模式

| 场景                      | 推荐方式                  | 说明                                       |
| ------------------------- | ------------------------- | ------------------------------------------ |
| 读取其他插件的模型/Schema | `dependencies` + 直接导入 | `from plugin_auth.auth.models import User` |
| 触发日志、通知等副作用    | `fire_and_forget()`       | 不需要等待结果                             |
| 缓存失效等必须等待的操作  | `async_emit()`            | 需要在响应前完成                           |

:::danger 未声明的跨插件导入是禁止的
在 `dependencies` 中没有声明的插件，不允许使用 `from plugin_xxx import ...`。CI 的 AST 扫描会自动检测违规导入。
:::

:::warning handler 异常不会中断其他 handler
EventBus 会捕获每个 handler 的异常并记录日志，然后继续执行后续 handler。如果业务逻辑需要事务性保证，不要使用 EventBus。
:::

### 可观测性

- **死信队列** — 无 handler 的事件自动记录为 `DeadLetter`，保留最近 100 条
- **错误统计** — handler 执行异常按事件类型自动计数
- **状态 API** — 通过 `GET /api/v1/system/events` 查看死信和错误统计

## 生命周期

### on_startup / on_shutdown

回调接收 `FastAPI` 实例，可访问 `app.state` 上的共享资源：

```python
import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

_tasks: list[asyncio.Task] = []


async def init_resources(app: FastAPI) -> None:
    """启动时初始化资源，创建后台任务。"""
    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_loop(socket)))


async def cleanup_resources(app: FastAPI) -> None:
    """关闭时清理资源。"""
    for t in _tasks:
        t.cancel()
    _tasks.clear()


def register() -> PluginManifest:
    return PluginManifest(
        name="hello",
        version="0.1.0",
        on_startup=[init_resources],
        on_shutdown=[cleanup_resources],
    )
```

### 执行顺序

- **启动回调** — 按拓扑序执行（被依赖的插件先启动）
- **关闭回调** — 按逆拓扑序执行（依赖方先关闭）
- 每个插件的启动耗时自动记录到 `PluginMeta.startup_ms`

:::warning 后台任务必须在 on_shutdown 中取消
如果在 `on_startup` 中创建了 `asyncio.Task`，必须在 `on_shutdown` 中 `cancel()` 它们。否则应用关闭时会报 `Task was destroyed but it is pending!` 警告。
:::

:::danger on_startup / on_shutdown 签名
回调函数必须接收一个 `FastAPI` 实例作为参数。写成 `async def my_startup() -> None:` 会在启动时抛出 `TypeError`。
:::

## 高级特性

### 版本约束（PEP 440）

通过 `PluginDependency` 声明对依赖插件的版本要求：

```python
from rapidkit_core.plugin import PluginDependency

dependencies = [
    PluginDependency(name="system", version=">=1.0.0,<2.0.0"),
    PluginDependency(name="user", version="~=0.3.0"),
]
```

支持所有 PEP 440 版本规范：`>=`、`<`、`~=`、`==`、`!=` 等。

- `required=True` 的插件版本不满足 → 阻止应用启动
- `required=False` 的插件版本不满足 → 跳过并记录结构化错误

### 级联故障处理

非必要插件（`required=False`）加载失败时，依赖它的插件也会被自动跳过：

```text
plugin_metrics 加载失败
→ plugin_analytics（非必要，依赖 metrics）自动跳过
→ 错误信息：PluginError(plugin_name="analytics", caused_by="metrics")
→ 应用正常启动（两个插件均不可用）
```

- 错误链通过 `PluginError.caused_by` 追踪根因
- `required=True` 的插件依赖了失败插件 → `PluginLoadError` 阻止启动
- 所有错误信息通过 `PluginLoadResult.errors` 结构化返回

### 可观测性

框架自动采集插件运行指标：

| 指标             | 说明                               | 获取方式                   |
| ---------------- | ---------------------------------- | -------------------------- |
| `register_ms`    | `register()` 函数执行耗时          | `PluginMeta.register_ms`   |
| `startup_ms`     | `on_startup` 回调执行耗时          | `PluginMeta.startup_ms`    |
| 死信队列         | 无 handler 的事件，保留最近 100 条 | `event_bus.dead_letters`   |
| handler 错误统计 | handler 异常按事件类型计数         | `event_bus.handler_errors` |

**状态 API：**

- `GET /api/v1/system/plugins` — 所有插件状态、版本、耗时、健康、错误信息
- `GET /api/v1/system/events` — EventBus 死信列表 + handler 错误统计
- `GET /api/v1/system/health` — 聚合健康检查

## 数据模型

使用 `rapidkit_common.models.SQLModel` 作为基类，通过 `PluginManifest.models` 注册：

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

```python
def register() -> PluginManifest:
    return PluginManifest(
        name="notification",
        version="0.1.0",
        models=[Notification],
    )
```

:::warning models 列表必须完整
`models` 列表必须包含插件定义的**所有** SQLModel 模型类，否则 Alembic 无法发现对应的表结构变更。
:::

:::warning **tablename** 必须显式声明
不要依赖 SQLModel 的自动表名推断。显式声明 `__tablename__` 确保迁移和数据库操作使用预期的表名。
:::

### 数据库迁移

插件的迁移文件存放在 `plugins/<name>/migrations/versions/`，使用 Alembic 多分支策略：

```bash
# 生成初始迁移
uv run alembic revision --autogenerate \
  --branch-label=notification \
  -m "add notification table" \
  --version-path plugins/notification/migrations/versions/

# 后续迁移
uv run alembic revision --autogenerate \
  --head=notification@head \
  -m "add notification_settings table" \
  --version-path plugins/notification/migrations/versions/

# 执行迁移
uv run alembic upgrade heads          # 全部分支
uv run alembic upgrade notification@head  # 仅特定插件
```

:::danger branch-label 必须唯一且与插件名一致
初次迁移使用 `--branch-label=xxx` 创建新分支。后续迁移必须使用 `--head=xxx@head` 追加到已有分支。
:::

## 权限声明

```python
permissions = ["hello:read", "hello:write", "hello:admin"]
```

- 命名规范：`插件名:操作`
- 声明的权限可被 auth 插件的 RBAC 系统管理和分配

## 测试

每个插件自带独立测试套件，至少包含以下测试：

### 注册测试

```python
def test_register_returns_manifest():
    from plugin_hello import register

    m = register()
    assert m.name == "hello"
    assert m.version == "0.1.0"
    assert m.router is not None


def test_router_has_routes():
    from plugin_hello import register

    m = register()
    routes = [r.path for r in m.router.routes]
    assert "/hello/greet" in routes
```

### 跨插件导入检查

防止未声明的跨插件依赖：

```python
import ast
from pathlib import Path


def test_no_cross_plugin_imports():
    """只允许导入已声明依赖的插件。"""
    allowed = {"plugin_hello"}  # 加上 dependencies 中声明的插件名
    plugin_src = Path(__file__).resolve().parent.parent / "src" / "plugin_hello"
    violations = []
    for py_file in plugin_src.rglob("*.py"):
        tree = ast.parse(py_file.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split(".")[0]
                if top.startswith("plugin_") and top not in allowed:
                    violations.append(f"{py_file.name}: {node.module}")
    assert violations == [], f"Cross-plugin imports: {violations}"
```

### 集成测试

```python
import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.mark.anyio
async def test_greet_endpoint(client):
    resp = await client.get("/api/v1/hello/greet")
    assert resp.status_code == 200
```

### 运行测试

```bash
# 单个插件
uv run pytest apps/backend/plugins/hello/tests/ -v

# 全部后端测试
uv run pytest apps/backend/tests/ -v
```

## 插件开发清单

创建新插件时的完整步骤：

- [ ] 创建目录结构：`plugins/<name>/pyproject.toml` + `src/plugin_<name>/`
- [ ] `pyproject.toml` 声明 entry point（`[project.entry-points."rapidkit.plugins"]`）和 build-system（hatchling）
- [ ] 实现 `register()` → `PluginManifest`
- [ ] 定义路由（`APIRouter`）
- [ ] 定义数据模型（`SQLModel`）并添加到 `models` 列表
- [ ] 声明依赖关系（`dependencies`）
- [ ] 声明权限标识（`permissions`）
- [ ] 实现生命周期回调（`on_startup` / `on_shutdown`）
- [ ] 定义事件和监听器（`event_listeners`）
- [ ] 声明中间件（`middlewares`）
- [ ] 声明依赖注入覆盖（`dependency_overrides`）
- [ ] 编写注册测试 + 跨插件导入检查
- [ ] 根 `pyproject.toml` 和 `apps/backend/pyproject.toml` 添加 workspace 依赖
- [ ] `alembic.ini` 添加 `version_locations` 路径
- [ ] `alembic/env.py` 的 `PLUGIN_MODULES` 列表添加插件名
- [ ] `uv sync` 安装
- [ ] `plugins.toml` 中配置启用（可选）
- [ ] 运行测试验证

## CI/CD 集成

CI 利用插件独立性优化测试效率：

- **变更检测** — 基于 `git diff` 自动识别受影响的插件
- **矩阵测试** — 只运行受影响插件的测试
- **全量回归** — `packages/core/` 或 `packages/common/` 变更时触发全量测试
- **CODEOWNERS** — 每个插件目录由对应团队负责 review

# 插件系统

## 为什么插件化

随着团队从 3-5 人扩展到 20 人，原有的单体 `domains/` 目录结构暴露了以下问题：

- **代码冲突频繁** — 多人同时修改 `domains/auth/` 等热点目录
- **迁移链冲突** — Alembic 单一迁移链导致 CI 排队
- **联调低效** — 修改一个领域需要理解全局依赖关系
- **CI 时间过长** — 每次提交都跑全量测试

插件化架构通过将业务代码拆分为独立的 workspace 包来解决这些问题，同时保持单体部署的简单性。

## 三层包结构

```
rapidkit-core  ←  rapidkit-common  ←  plugin_*
```

| 层       | 包名              | 位置                      | 职责                                                 |
| -------- | ----------------- | ------------------------- | ---------------------------------------------------- |
| 基础设施 | `rapidkit-core`   | `packages/core/`          | 配置、数据库、异常、日志、安全、插件加载器、EventBus |
| 公共     | `rapidkit-common` | `packages/common/`        | 基类模型、CRUD、依赖注入、Schema、权限抽象、枚举     |
| 业务     | `plugin_*`        | `apps/backend/plugins/*/` | 各业务领域的独立实现                                 |

所有包通过 uv workspace 管理，以 editable 模式安装，开发体验与普通包导入一致。

:::warning 依赖方向是单向的
`plugin_*` 可以导入 `rapidkit-common` 和 `rapidkit-core`，`rapidkit-common` 可以导入 `rapidkit-core`，但反方向的导入是**严格禁止**的。如果需要从 core/common 调用插件代码，应使用 EventBus 或依赖注入。
:::

## PluginManifest

每个插件通过 `register()` 返回 `PluginManifest`，声明自身的元数据：

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

### 完整字段参考

| 字段              | 类型                                                 | 默认值 | 说明                                           |
| ----------------- | ---------------------------------------------------- | ------ | ---------------------------------------------- |
| `name`            | `str`                                                | 必填   | 插件唯一标识，小写，如 `"notification"`        |
| `version`         | `str`                                                | 必填   | 语义化版本号                                   |
| `router`          | `APIRouter \| None`                                  | `None` | FastAPI 路由，自动注册到 `/api/v1/`            |
| `models`          | `list[type]`                                         | `[]`   | SQLModel 模型类，供 Alembic 自动发现           |
| `dependencies`    | `list[str]`                                          | `[]`   | 依赖的其他插件名称，决定加载顺序               |
| `permissions`     | `list[PermissionDef]`                                | `[]`   | 插件声明的权限定义                             |
| `required`        | `bool`                                               | `True` | 加载失败是否中止应用启动                       |
| `on_startup`      | `list[Callable[[FastAPI], Coroutine]]`               | `[]`   | 应用启动时的异步回调，接收 FastAPI app 实例    |
| `on_shutdown`     | `list[Callable[[FastAPI], Coroutine]]`               | `[]`   | 应用关闭时的异步回调，接收 FastAPI app 实例    |
| `event_listeners` | `list[tuple[str, Callable]]`                         | `[]`   | 事件监听器声明，`(event_name, handler)` 二元组 |
| `health_check`    | `Callable[[], Coroutine[..., HealthStatus]] \| None` | `None` | 可选的异步健康检查回调                         |

:::danger on_startup / on_shutdown 签名
回调函数必须接收一个 `FastAPI` 实例作为参数：

```python
async def my_startup(app: FastAPI) -> None:
    socket = app.state.socket  # 通过 app.state 访问共享资源
```

如果你写成了 `async def my_startup() -> None:`（无参数），启动时会抛出 `TypeError`。
:::

## 插件加载器

`rapidkit_core.loader.discover_and_load_plugins()` 负责整个加载流程：

```
导入模块 → 调用 register() → 拓扑排序 → 注册 EventBus 监听器 → 返回排序后的插件列表
```

1. **导入插件模块** — 通过 `importlib.import_module(module_name)` 加载
2. **调用 register()** — 获取 PluginManifest，必须返回正确类型
3. **拓扑排序** — 基于 `dependencies` 字段，使用 Kahn 算法确定加载顺序
4. **注册事件监听** — 遍历每个 manifest 的 `event_listeners`，按拓扑顺序注册到全局 EventBus
5. **错误处理** — 必选插件失败则中止启动

```python
# apps/backend/src/main.py
from rapidkit_core.loader import discover_and_load_plugins

PLUGIN_MODULES: list[str] = [
    "plugin_auth",
    "plugin_script",
    "plugin_monitoring",
    "plugin_system",
    "plugin_menu",
    "plugin_user",
]

# 条件加载 Celery 相关插件
if settings.ENABLE_CELERY_MONITOR:
    PLUGIN_MODULES.append("plugin_worker")
    PLUGIN_MODULES.append("plugin_schedule")

plugins = discover_and_load_plugins(PLUGIN_MODULES)
app.state.plugins = plugins
```

:::warning 插件注册顺序
`PLUGIN_MODULES` 列表的书写顺序**不影响**加载顺序。实际加载顺序由 `dependencies` 字段决定（拓扑排序）。但如果两个插件之间没有依赖关系，它们的相对顺序会保持列表中的顺序。
:::

## EventBus

跨插件通信通过 `rapidkit_core.events.event_bus` 全局单例实现松耦合。

### API 参考

```python
from rapidkit_core.events import event_bus

# 注册监听器（通常在 PluginManifest.event_listeners 中声明，不手动调用）
event_bus.on(event="role.permissions_changed", handler=my_handler, allowed_sources=["auth"])

# 同步触发事件（仅调用同步 handler，异步 handler 会被跳过并警告）
event_bus.emit("activity.log", {"event_type": "user_login", ...}, source="auth")

# 异步触发事件（支持同步和异步 handler）
await event_bus.async_emit("role.permissions_changed", {"role_code": "ADMIN", ...}, source="auth")
```

### 声明式注册（推荐）

通过 `PluginManifest.event_listeners` 声明监听器，加载器会自动注册：

```python
# plugin_system/__init__.py
def _on_activity_event(data: dict) -> None:
    """同步 handler — 内部使用 fire-and-forget 异步化。"""
    ActivityService.log_activity_fire_and_forget(**data)

def register() -> PluginManifest:
    return PluginManifest(
        name="system",
        event_listeners=[("activity.log", _on_activity_event)],
        ...
    )
```

### emit vs async_emit

| 方法           | 适用场景                                   | handler 支持        |
| -------------- | ------------------------------------------ | ------------------- |
| `emit()`       | 不需要等待结果，fire-and-forget 场景       | 仅同步 handler      |
| `async_emit()` | 需要等待完成（如缓存失效必须在响应前完成） | 同步 + 异步 handler |

:::danger 在同步 emit 中使用异步 handler
如果注册了 `async` handler 但用 `emit()`（同步）触发，该 handler 会被**跳过**并输出警告日志。确保 handler 类型与触发方式匹配。
:::

### 现有事件

| 事件名                     | 发布方       | 监听方 | 说明                                   |
| -------------------------- | ------------ | ------ | -------------------------------------- |
| `activity.log`             | auth, worker | system | 记录系统活动日志（fire-and-forget）    |
| `role.permissions_changed` | auth         | user   | 角色权限变更后清除用户缓存（同步等待） |

## 依赖注入

### dependency_overrides

`rapidkit-common` 中的 `VerifyPermissionDep` 和 `UserDBDep` 使用占位函数定义，`plugin_auth` 在启动时通过 FastAPI 的 `dependency_overrides` 注入真实实现：

```python
# rapidkit_common/auth.py — 定义占位
async def _verify_user_permission_placeholder(): ...
VerifyPermissionDep = Annotated[None, Depends(_verify_user_permission_placeholder)]

# plugin_auth/__init__.py — 注入真实实现
def setup_dependency_overrides(app):
    app.dependency_overrides[_verify_user_permission_placeholder] = verify_user_permission
```

这样任何插件都可以使用 `VerifyPermissionDep` 保护路由，而无需直接依赖 `plugin_auth`。

### app.state 注入

共享资源通过 `app.state` 挂载，插件在运行时通过 `Request` 或生命周期回调访问：

| 属性                   | 挂载时机                            | 使用方式                                                              |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `app.state.socket`     | `create_app()` 中固定挂载           | `request.app.state.socket` 或 `on_startup(app)` 中 `app.state.socket` |
| `app.state.celery_app` | `ENABLE_CELERY_MONITOR=true` 时挂载 | `request.app.state.celery_app`                                        |
| `app.state.plugins`    | 加载器返回后挂载                    | `app.state.plugins`                                                   |
| `app.state.limiter`    | `create_app()` 中挂载               | `app.state.limiter`                                                   |

```python
# 在 API 端点中访问
@router.post("/trigger")
async def trigger_task(request: Request, body: TriggerTaskRequest):
    celery_app = request.app.state.celery_app
    await trigger_task(celery_app, body.task_name, ...)

# 在 on_startup 回调中访问
async def _startup(app: FastAPI) -> None:
    socket = app.state.socket
    _tasks.append(asyncio.create_task(push_loop(socket)))
```

:::warning 不要在模块顶层访问 app.state
`app.state` 在应用创建后才可用。在模块顶层 `from xxx import app` 然后访问 `app.state.socket` 会导致 `AttributeError`。始终通过函数参数传递。
:::

## 现有插件依赖关系

```
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

| 插件         | dependencies                 | 说明                                 |
| ------------ | ---------------------------- | ------------------------------------ |
| `auth`       | `[]`                         | 认证、角色、路由管理。最底层业务插件 |
| `script`     | `[]`                         | 脚本管理与执行                       |
| `monitoring` | `[]`                         | API 指标监控                         |
| `schedule`   | `[]`                         | Celery 定时任务（条件加载）          |
| `worker`     | `[]`                         | Celery Worker 管理（条件加载）       |
| `menu`       | `["auth"]`                   | 菜单与前端动态路由                   |
| `system`     | `["auth", "menu", "script"]` | 仪表盘、活动日志、基础设施健康       |
| `user`       | `["auth", "system"]`         | 用户管理                             |

加载顺序：`auth → script → monitoring → schedule → worker → menu → system → user`

## CI/CD 集成

CI 利用插件独立性优化测试效率：

- **变更检测** — 基于 `git diff` 自动识别受影响的插件
- **矩阵测试** — 只运行受影响插件的测试
- **全量回归** — `packages/core/` 或 `packages/common/` 变更时触发全量测试
- **CODEOWNERS** — 每个插件目录由对应团队负责 review

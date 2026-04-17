"""
插件清单与元数据定义。

Author : Coke
Date   : 2026-04-14
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Union

from rapidkit_core.events import Event

if TYPE_CHECKING:
    from fastapi import FastAPI


class HealthStatus(str, Enum):
    """插件健康状态。"""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class PermissionDef:
    """插件声明的权限定义。"""

    code: str
    name: str
    description: str = ""


@dataclass
class MiddlewareDef:
    """插件声明的中间件定义。"""

    cls: type
    """中间件类。"""

    kwargs: dict = field(default_factory=dict)
    """传给中间件构造函数的参数。"""

    order: int = 0
    """越小越先执行（越靠近请求入口）。"""


@dataclass
class PluginDependency:
    """带版本约束的插件依赖声明。"""

    name: str
    """被依赖的插件名称。"""

    version: str | None = None
    """PEP 440 版本范围约束，如 '>=1.0,<3.0'。None 表示不限版本。"""


@dataclass
class PluginError:
    """结构化插件加载错误。"""

    plugin_name: str
    """出错的插件名称。"""

    phase: str
    """出错阶段：'import' | 'register' | 'version_check' | 'startup'。"""

    message: str
    """错误描述。"""

    caused_by: str | None = None
    """级联失败时指向根因插件名称。"""


@dataclass
class PluginMeta:
    """插件运行时元数据，用于状态 API 和可观测性。"""

    register_ms: float = 0
    """register() 调用耗时（毫秒）。"""

    startup_ms: float = 0
    """on_startup 回调耗时（毫秒）。"""

    status: str = "loaded"
    """运行状态：'loaded' | 'disabled' | 'failed' | 'degraded'。"""


@dataclass
class PluginManifest:
    """
    插件注册清单。

    每个插件的 ``register()`` 函数返回此对象，描述插件的路由、模型、
    依赖关系和生命周期回调。
    """

    name: str
    version: str

    # FastAPI APIRouter（可选）
    router: Any | None = None

    # SQLModel 模型类列表（Alembic 发现用）
    models: list[type] = field(default_factory=list)

    # 依赖的其他插件名称（支持 str 或 PluginDependency）
    dependencies: list[str | PluginDependency] = field(default_factory=list)

    # 插件声明的权限
    permissions: list[PermissionDef] = field(default_factory=list)

    # 是否为必要插件（加载失败时是否中止应用）
    required: bool = True

    # 生命周期回调
    on_startup: list[Callable[[FastAPI], Coroutine[Any, Any, None]]] = field(default_factory=list)
    on_shutdown: list[Callable[[FastAPI], Coroutine[Any, Any, None]]] = field(default_factory=list)

    # 事件监听器：(EventType, handler) 或 (EventType, handler, priority) 列表
    event_listeners: list[Union[tuple[type[Event], Callable], tuple[type[Event], Callable, int]]] = field(
        default_factory=list
    )

    # 健康检查回调
    health_check: Callable[[], Coroutine[Any, Any, HealthStatus]] | None = None

    # FastAPI dependency_overrides（语义与 app.dependency_overrides 一致）
    dependency_overrides: dict[Callable, Callable] = field(default_factory=dict)

    # 插件声明的中间件
    middlewares: list[MiddlewareDef] = field(default_factory=list)


@dataclass
class PluginLoadResult:
    """插件加载结果，包含成功/禁用/失败信息。"""

    plugins: list[PluginManifest]
    """成功加载的插件，已拓扑排序。"""

    disabled: list[str] = field(default_factory=list)
    """配置中禁用的插件名。"""

    errors: dict[str, PluginError] = field(default_factory=dict)
    """非 required 插件的加载错误 {name: PluginError}。"""

    meta: dict[str, PluginMeta] = field(default_factory=dict)
    """插件运行时元数据 {name: PluginMeta}。"""

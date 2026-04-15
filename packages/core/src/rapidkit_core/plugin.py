"""
插件清单与元数据定义。

Author : Coke
Date   : 2026-04-14
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Coroutine

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

    # 依赖的其他插件名称
    dependencies: list[str] = field(default_factory=list)

    # 插件声明的权限
    permissions: list[PermissionDef] = field(default_factory=list)

    # 是否为必要插件（加载失败时是否中止应用）
    required: bool = True

    # 生命周期回调
    on_startup: list[Callable[[FastAPI], Coroutine[Any, Any, None]]] = field(default_factory=list)
    on_shutdown: list[Callable[[FastAPI], Coroutine[Any, Any, None]]] = field(default_factory=list)

    # 事件监听器：(event_name, handler) 列表
    event_listeners: list[tuple[str, Callable]] = field(default_factory=list)

    # 健康检查回调
    health_check: Callable[[], Coroutine[Any, Any, HealthStatus]] | None = None

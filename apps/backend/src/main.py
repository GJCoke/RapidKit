"""
FastAPI 入口。

这是 FastAPI 应用的主入口，负责设置中间件、路由和异常处理。

Author : Coke
Date   : 2025-03-10
"""

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from rapidkit_common.schemas.response import Response as SchemaResponse
from rapidkit_common.utils import format_validation_errors
from rapidkit_core.config import settings
from rapidkit_core.log import logger, set_custom_logfile, setup_logging
from rapidkit_core.nanoid import NanoIdPlugin
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.limiter import RateLimiterService
from rapidkit_framework.status_codes import StatusCode
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException
from starlette_context import context

from src.lifecycle import lifespan
from src.locales.i18n import is_i18n_key, t
from src.middlewares.audit import AuditMiddleware
from src.middlewares.context import ContextMiddleware
from src.middlewares.i18n import I18nMiddleware
from src.middlewares.limiter import SlowAPIMiddleware
from src.middlewares.logger import LoggerMiddleware
from src.middlewares.metrics import MetricsMiddleware
from src.middlewares.state import StateMiddleware
from src.sio.app import socket_app

_background_tasks: set[asyncio.Task] = set()


async def _increment_biz_error() -> None:
    """将业务异常计数写入 Redis（fire-and-forget）。"""
    try:
        from rapidkit_core.database import RedisManager

        redis = RedisManager.client()
        hour_bucket = timezone.now().strftime("%Y%m%d_%H")
        key = f"metrics:errors:biz:{hour_bucket}"
        await redis.hincrby(key, "count", 1)
        await redis.expire(key, 7200)
    except Exception:
        logger.debug("Failed to increment biz error count", exc_info=True)


def _get_request_user(_: Request) -> str:
    """从请求上下文中提取 user_id 用于异常日志。"""
    if context.exists():
        user_id = context.get("user_id")
        if user_id:
            return str(user_id)

    return "-"


def setup_logging_config() -> None:
    """初始化日志配置。"""
    setup_logging()
    set_custom_logfile()


def setup_middlewares(app: FastAPI) -> None:
    """
    配置应用中间件。

    中间件的注册机制为 先进后出。
    插件中间件在全局中间件之前注册，全局中间件更靠近请求入口。
    """
    # 插件中间件（按 order 排序挂载）
    from rapidkit_framework.loader import mount_plugin_middlewares

    mount_plugin_middlewares(app, getattr(app.state, "plugins", []))

    # 全局中间件（基础设施层，最靠近请求入口）
    app.add_middleware(StateMiddleware)
    app.add_middleware(AuditMiddleware)
    app.add_middleware(MetricsMiddleware)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(I18nMiddleware)
    app.add_middleware(LoggerMiddleware)
    app.add_middleware(
        ContextMiddleware,
        plugins=(NanoIdPlugin(),),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=settings.CORS_ORIGINS_REGEX,
        allow_credentials=True,
        allow_methods=("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
        allow_headers=settings.CORS_HEADERS,
    )


def setup_exception_handlers(app: FastAPI) -> None:
    """配置异常处理器。"""

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        """处理请求速率限制超出异常。"""
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=AppException(StatusCode.TOO_MANY_REQUESTS).dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_errors(request: Request, exc: RequestValidationError) -> JSONResponse:
        """捕获参数校验异常并处理其结构。"""
        details = format_validation_errors(exc)
        logger.warning(
            '{user} "{method} {path}" RequestValidationError: {details}',
            user=_get_request_user(request),
            method=request.method,
            path=request.url.path,
            details=details,
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=AppException(StatusCode.VALIDATION_ERROR, data=details).dump(),
        )

    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        """应用业务异常处理，使用业务状态码。"""
        logger.warning(
            '{user} "{method} {path}" AppException[{code}]: {message}',
            user=_get_request_user(request),
            method=request.method,
            path=request.url.path,
            code=exc.code,
            message=exc.message,
        )
        task = asyncio.create_task(_increment_biz_error())
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=exc.dump(),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        """HTTP 异常自定义处理。"""
        logger.error(
            '{user} "{method} {path}" {status_code} HTTPException: {detail}',
            user=_get_request_user(request),
            method=request.method,
            path=request.url.path,
            status_code=exc.status_code,
            detail=exc.detail,
        )
        detail = str(exc.detail)
        msg = t(detail) if is_i18n_key(detail) else detail  # type: ignore

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=SchemaResponse(code=exc.status_code, message=msg).serializable_dict(),
        )

    @app.exception_handler(Exception)
    async def handle_server_errors(request: Request, exc: Exception) -> JSONResponse:
        """捕获所有非预期异常并返回 500 状态码。"""
        logger.exception(
            '{user} "{method} {path}" {status_code} ServerException: {detail}',
            user=_get_request_user(request),
            method=request.method,
            path=request.url.path,
            status_code=int(StatusCode.INTERNAL_SERVER_ERROR),
            detail=str(exc),
        )
        error_data = str(exc) if settings.ENVIRONMENT.is_debug else None
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=AppException(StatusCode.INTERNAL_SERVER_ERROR, data=error_data).dump(),
        )


def setup_router(app: FastAPI) -> None:
    """配置应用路由。"""
    from fastapi import APIRouter
    from rapidkit_core.config import settings

    v1_router = APIRouter(prefix=settings.API_PREFIX_V1)

    # 注册插件路由
    for plugin in getattr(app.state, "plugins", []):
        if plugin.router is not None:
            v1_router.include_router(plugin.router)

    app.include_router(v1_router)


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用。"""
    # 注册 i18n 翻译函数到 rapidkit-core
    from rapidkit_framework.i18n import set_translator

    from src.locales.i18n import is_i18n_key as actual_is_key
    from src.locales.i18n import t as actual_t

    set_translator(lambda s: actual_t(s), actual_is_key)

    setup_logging_config()

    # 加载插件 — entry points 自动发现 + plugins.toml 配置
    from rapidkit_framework.loader import discover_and_load_plugins

    app_configs: dict[str, Any] = {
        "title": settings.APP_NAME,
        "description": settings.APP_DESCRIPTION,
        "version": settings.APP_VERSION,
    }
    if not settings.ENVIRONMENT.is_debug:
        app_configs["openapi_url"] = None

    app = FastAPI(**app_configs, lifespan=lifespan)

    result = discover_and_load_plugins(config_path=Path(__file__).resolve().parent.parent / "plugins.toml")
    app.state.plugins = result.plugins
    app.state.plugin_load_result = result
    app.state.plugin_meta = result.meta

    # 按拓扑序注册 ServiceRegistry 服务
    from rapidkit_framework.loader import apply_dependency_overrides, resolve_services
    from rapidkit_framework.services import service_registry

    resolve_services(service_registry, result.plugins)

    # 按拓扑序应用插件声明的 dependency_overrides
    apply_dependency_overrides(app, result.plugins)

    app.mount("/socket.io", socket_app)

    # 将 socket 挂到 app.state，供插件 on_startup 回调使用
    from src.sio.app import socket

    app.state.socket = socket

    from src.sio.app import auto_register_events

    auto_register_events(result.plugins)

    # Socket.IO 文档 (仅 debug 模式)
    if settings.ENVIRONMENT.is_debug:
        socket.setup_docs(
            app,
            path="/sio/docs",
            title=f"{settings.APP_NAME} Socket.IO",
            version=settings.APP_VERSION,
            description=settings.APP_DESCRIPTION,
        )

    # 将 celery_app 挂到 app.state，供 plugin_worker 使用
    if settings.ENABLE_CELERY_MONITOR:
        from src.queues.app import app as celery_app

        app.state.celery_app = celery_app

    # 初始化速率限制服务
    limiter = RateLimiterService.init_limiter()
    app.state.limiter = limiter

    # 配置中间件和异常处理器
    setup_middlewares(app)
    setup_exception_handlers(app)

    # 注册路由
    setup_router(app)

    return app


app = create_app()

"""
FastAPI 入口。

这是 FastAPI 应用的主入口，负责设置中间件、路由和异常处理。

Author : Coke
Date   : 2025-03-10
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette_context.middleware import ContextMiddleware

from src.api.v1 import v1_router
from src.core.config import app_configs, settings
from src.core.exceptions import AppException
from src.core.lifecycle import lifespan
from src.core.log import logger, set_custom_logfile, setup_logging
from src.core.status_codes import StatusCode
from src.locales.i18n import is_i18n_key, t
from src.middlewares.i18n import I18nMiddleware
from src.middlewares.logger import LoggerMiddleware
from src.middlewares.state import StateMiddleware
from src.schemas.response import Response as SchemaResponse
from src.utils.nanoid import NanoIdPlugin
from src.utils.utils import format_validation_errors
from src.websockets.app import socket_app

setup_logging()
set_custom_logfile()

app = FastAPI(**app_configs, lifespan=lifespan)
app.mount("/socket.io", socket_app)

# 中间件的注册机制为 先进后出
app.add_middleware(StateMiddleware)  # type: ignore
app.add_middleware(I18nMiddleware)  # type: ignore
app.add_middleware(LoggerMiddleware)  # type: ignore
app.add_middleware(
    ContextMiddleware,  # type: ignore
    plugins=(NanoIdPlugin(),),
    default_error_response=JSONResponse(
        status_code=status.HTTP_200_OK,
        content=AppException(StatusCode.BAD_REQUEST).dump(),  # i18n 内容依赖上下文，此时还未进入请求周期，暂用原始值
    ),
)
app.add_middleware(
    CORSMiddleware,  # type: ignore
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGINS_REGEX,
    allow_credentials=True,
    allow_methods=("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    allow_headers=settings.CORS_HEADERS,
)


@app.exception_handler(Exception)
async def handle_server_errors(request: Request, exc: Exception) -> JSONResponse:
    """
    捕获所有非预期异常并返回 500 状态码。
    """

    logger.error(
        '"{method} {path}" {status_code} ServerException: {detail}',
        method=request.method,
        path=request.url.path,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=AppException(StatusCode.INTERNAL_SERVER_ERROR, data=str(exc)).dump(),
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_errors(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    捕获参数校验异常并处理其结构。
    """

    details = format_validation_errors(exc)
    logger.warning(
        '"{method} {path}" RequestValidationError: {details}',
        method=request.method,
        path=request.url.path,
        details=details,
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=AppException(StatusCode.VALIDATION_ERROR, data=details).dump(),
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    """
    HTTP 异常自定义处理。
    """

    logger.error(
        '"{method} {path}" {status_code} HTTPException: {detail}',
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


app.include_router(v1_router)

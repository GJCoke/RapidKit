"""
FastAPI 入口。

这是 FastAPI 应用的主入口，负责设置中间件、路由和异常处理。

作者 : Coke
日期 : 2025-03-10
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette_context.middleware import ContextMiddleware

from src.api.v1 import v1_router
from src.core.config import app_configs, settings
from src.core.lifecycle import lifespan
from src.locales.i18n import t
from src.middlewares.i18n import I18nMiddleware
from src.middlewares.logger import LoggerMiddleware
from src.middlewares.state import StateMiddleware
from src.schemas.response import Response as SchemaResponse
from src.schemas.response import ServerErrorResponse, ValidationErrorResponse
from src.utils.utils import format_validation_errors
from src.websockets.app import socket_app

logger = logging.getLogger(__name__)

app = FastAPI(**app_configs, lifespan=lifespan)
app.mount("/socket.io", socket_app)
app.add_middleware(
    CORSMiddleware,  # type: ignore
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGINS_REGEX,
    allow_credentials=True,
    allow_methods=("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    allow_headers=settings.CORS_HEADERS,
)
app.add_middleware(StateMiddleware)  # type: ignore
app.add_middleware(I18nMiddleware)  # type: ignore
app.add_middleware(ContextMiddleware)  # type: ignore
app.add_middleware(LoggerMiddleware)  # type: ignore


@app.exception_handler(Exception)
async def handle_server_errors(request: Request, exc: Exception) -> JSONResponse:
    """
    捕获所有非预期异常并返回 500 状态码。
    """

    logger.error(
        '"%s %s" %d ServerException: %s',
        request.method,
        request.url.path,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        str(exc),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ServerErrorResponse(data=str(exc)).serializable_dict(),
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_errors(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    捕获参数校验异常并处理其结构。
    """

    details = format_validation_errors(exc)
    logger.warning(
        '"%s %s" RequestValidationError: %s',
        request.method,
        request.url.path,
        details,
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=ValidationErrorResponse(data=details).serializable_dict(),
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    """
    HTTP 异常自定义处理。
    """

    logger.error(
        '"%s %s" %d HTTPException: %s',
        request.method,
        request.url.path,
        exc.status_code,
        exc.detail,
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=SchemaResponse(code=exc.status_code, message=t(str(exc.detail))).serializable_dict(),  # type: ignore
    )


app.include_router(v1_router)

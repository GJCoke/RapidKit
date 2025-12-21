"""
FastAPI entry point.

This is the main entry point for the FastAPI application. It sets up the middleware,
routes, and exception handling for the application.

Author : Coke
Date   : 2025-03-10
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette_context.middleware import ContextMiddleware

from src.api.v1 import v1_router
from src.core.config import app_configs, settings
from src.core.lifecycle import lifespan
from src.locales.i18n import t
from src.middlewares.i18n import I18nMiddleware
from src.middlewares.logger import LoggerMiddleware
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
app.add_middleware(I18nMiddleware)  # type: ignore

app.add_middleware(ContextMiddleware)  # type: ignore

app.add_middleware(LoggerMiddleware)  # type: ignore


@app.exception_handler(Exception)
async def handle_server_errors(request: Request, exc: Exception) -> JSONResponse:
    """Capture all non-deliberate exceptions and respond with a 500 status code."""

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
    """Capture parameter exception errors and process their structure."""

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
    """Custom handler for HTTP exceptions."""

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

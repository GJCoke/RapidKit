"""
Config settings.

This file holds the project configuration settings loaded from environment variables.

Author : Coke
Date   : 2025-03-11
"""

import warnings
from typing import Literal, TypeAlias

from pydantic import Field, PostgresDsn, RedisDsn, Secret, field_validator
from pydantic_settings import BaseSettings as _BaseSettings
from pydantic_settings import SettingsConfigDict
from slowapi.extension import StrOrCallableStr

from rapidkit_core.environment import Environment

LANGUAGE_TYPE: TypeAlias = Literal["zh-CN", "en-US"]

LOG_LEVELS: TypeAlias = Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class ConfigError(Exception):
    """配置错误。"""


class BaseSettings(_BaseSettings):
    """Pydantic 的 BaseSettings 基类。"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class PostgreSQLConfigMixin(BaseSettings):
    """PostgreSQL 数据库配置。"""

    POSTGRESQL_ASYNC_SCHEME: str
    POSTGRESQL_SYNC_SCHEME: str
    POSTGRESQL_USERNAME: str
    POSTGRESQL_PASSWORD: Secret[str]
    POSTGRESQL_HOST: str
    POSTGRESQL_PORT: int = Field(5432, ge=0, le=65535)
    POSTGRESQL_DATABASE: str

    @property
    def ASYNC_DATABASE_POSTGRESQL_URL(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme=self.POSTGRESQL_ASYNC_SCHEME,
            username=self.POSTGRESQL_USERNAME,
            password=self.POSTGRESQL_PASSWORD.get_secret_value(),
            host=self.POSTGRESQL_HOST,
            port=self.POSTGRESQL_PORT,
            path=self.POSTGRESQL_DATABASE,
        )

    @property
    def SYNC_DATABASE_POSTGRESQL_URL(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme=self.POSTGRESQL_SYNC_SCHEME,
            username=self.POSTGRESQL_USERNAME,
            password=self.POSTGRESQL_PASSWORD.get_secret_value(),
            host=self.POSTGRESQL_HOST,
            port=self.POSTGRESQL_PORT,
            path=self.POSTGRESQL_DATABASE,
        )


class RedisConfigMixin(BaseSettings):
    """Redis 配置。"""

    REDIS_SCHEME: str = "redis"
    REDIS_MAX_CONNECTIONS: int = 10
    REDIS_ROOT_USERNAME: str = ""
    REDIS_ROOT_PASSWORD: Secret[str]
    REDIS_HOST: str
    REDIS_PORT: int = Field(6379, ge=0, le=65535)
    REDIS_DATABASE: int = Field(0, ge=0, le=15)

    @property
    def REDIS_URL(self) -> RedisDsn:
        return RedisDsn.build(
            scheme=self.REDIS_SCHEME,
            username=self.REDIS_ROOT_USERNAME,
            password=self.REDIS_ROOT_PASSWORD.get_secret_value(),
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            path=str(self.REDIS_DATABASE),
        )


class CeleryConfigMixin(RedisConfigMixin):
    """Celery 任务队列配置。"""

    CELERY_REDIS_DATABASE: int = Field(1, ge=0, le=15)
    ENABLE_CELERY_MONITOR: bool = Field(
        True,
        description="是否启用 Celery 任务队列管理（事件消费、Worker 监控、管理 API）",
    )

    @property
    def CELERY_REDIS_URL(self) -> RedisDsn:
        return RedisDsn.build(
            scheme=self.REDIS_SCHEME,
            username=self.REDIS_ROOT_USERNAME,
            password=self.REDIS_ROOT_PASSWORD.get_secret_value(),
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            path=str(self.CELERY_REDIS_DATABASE),
        )


class ScriptConfigMixin(BaseSettings):
    """脚本执行配置。"""

    SCRIPT_EXEC_TIMEOUT: int = Field(30, description="脚本执行超时时间（秒）")
    SCRIPT_EXEC_MAX_OUTPUT: int = Field(65536, description="脚本执行最大输出字节数")


class LogConfigMixin(BaseSettings):
    """日志配置。"""

    LOG_LEVEL: LOG_LEVELS = "INFO"
    LOG_FILE_ACCESS_LEVEL: LOG_LEVELS = "INFO"
    LOG_FILE_ERROR_LEVEL: LOG_LEVELS = "WARNING"

    LOG_ACCESS_FILENAME: str = "access.log"
    LOG_ERROR_FILENAME: str = "error.log"

    LOG_FORMAT: str = "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</> | <lvl>{level: <8}</> | <cyan>{request_id}</> | <blue>{extra[plugin]: <12}</> | <lvl>{message}</>"

    SLOW_REQUEST_THRESHOLD_MS: int = Field(3000, description="慢请求告警阈值（毫秒）")


class CorsConfigMixin(BaseSettings):
    """CORS 跨域配置。"""

    CORS_ORIGINS: list[str]
    CORS_ORIGINS_REGEX: str | None = None
    CORS_HEADERS: list[str]


class RateLimitConfigMixin(BaseSettings):
    """速率限制配置。"""

    DEFAULT_LIMITS: list[StrOrCallableStr] = ["20/minute"]


class SocketIOConfigMixin(BaseSettings):
    """SocketIO 管理配置。"""

    SOCKETIO_ADMIN_USERNAME: str = "admin"
    SOCKETIO_ADMIN_PASSWORD: Secret[str] = Secret("change-me-in-production")


class AuditMixin(BaseSettings):
    """审计日志配置。"""

    AUDIT_ENABLED: bool = True
    AUDIT_EXCLUDE_PATHS: list[str] = [
        "/health",
        "/metrics",
        "/socket.io",
        "/docs",
        "/openapi.json",
        "/redoc",
    ]
    AUDIT_SENSITIVE_FIELDS: list[str] = [
        "password",
        "token",
        "secret",
        "key",
        "authorization",
    ]
    AUDIT_MAX_BODY_SIZE: int = Field(10240, description="请求体最大记录大小（字节）")
    AUDIT_BATCH_SIZE: int = Field(50, description="批量写入条数")
    AUDIT_FLUSH_INTERVAL: float = Field(5.0, description="定时刷新间隔（秒）")


class Config(
    PostgreSQLConfigMixin,
    CeleryConfigMixin,
    ScriptConfigMixin,
    LogConfigMixin,
    CorsConfigMixin,
    RateLimitConfigMixin,
    SocketIOConfigMixin,
    AuditMixin,
):
    """从环境变量加载的项目配置设置。"""

    # MinIO configuration settings
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: Secret[str]

    # Current environment (e.g., TESTING, PRODUCTION)
    ENVIRONMENT: Environment = Environment.PRODUCTION

    # noinspection PyNestedDecorators
    @field_validator("ENVIRONMENT")
    @classmethod
    def environment_validator(cls, environment: Environment) -> Environment:
        if environment.value == Environment.LOCAL:
            warnings.warn(
                "The application is currently running in the local environment. "
                "Make sure to update environment-specific settings before deploying to production.",
                RuntimeWarning,
            )
        return environment

    API_PREFIX_V1: str = "/api/v1"

    # App info
    APP_NAME: str = "RapidKit"
    APP_DESCRIPTION: str = "RapidKit Admin API"
    APP_VERSION: str = "0.1.0"

    # Datetime settings
    DATETIME_TIMEZONE: str = "Asia/Shanghai"
    DATETIME_FORMAT: str = "%Y-%m-%d %H:%M:%S"

    # I18n settings
    DEFAULT_LANGUAGE: LANGUAGE_TYPE = "zh-CN"


settings = Config()  # type: ignore

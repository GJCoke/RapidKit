"""
Config settings.

This file holds the project configuration settings loaded from environment variables.

Author : Coke
Date   : 2025-03-11
"""

import os
import re
import secrets
import warnings
from datetime import timedelta
from typing import Any, Literal, TypeAlias

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from pydantic import Field, PostgresDsn, RedisDsn, Secret, field_validator, model_validator
from pydantic_settings import BaseSettings as _BaseSettings
from pydantic_settings import SettingsConfigDict
from slowapi.extension import StrOrCallableStr

from src.core.environment import Environment
from src.locales.types import LANGUAGE_TYPE
from src.utils.constants import DAYS, WEEKS
from src.utils.security import AccessSecret, RefreshSecret, generate_rsa_key_pair, load_private_key, serialize_key

LOG_LEVELS: TypeAlias = Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class ConfigError(Exception):
    """配置错误。"""


class BaseSettings(_BaseSettings):
    """Pydantic 的 BaseSettings 基类。"""

    # Pydantic model config for reading from an .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class Config(BaseSettings):
    """从环境变量加载的项目配置设置。"""

    # PostgreSQL configuration settings
    POSTGRESQL_ASYNC_SCHEME: str
    POSTGRESQL_SYNC_SCHEME: str
    POSTGRESQL_USERNAME: str
    POSTGRESQL_PASSWORD: Secret[str]
    POSTGRESQL_HOST: str
    POSTGRESQL_PORT: int = Field(5432, ge=0, le=65535)
    POSTGRESQL_DATABASE: str

    @property
    def ASYNC_DATABASE_POSTGRESQL_URL(self) -> PostgresDsn:
        """生成并返回 PostgreSQL 连接 URL。"""
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
        """生成并返回 PostgreSQL 连接 URL。"""
        return PostgresDsn.build(
            scheme=self.POSTGRESQL_SYNC_SCHEME,
            username=self.POSTGRESQL_USERNAME,
            password=self.POSTGRESQL_PASSWORD.get_secret_value(),
            host=self.POSTGRESQL_HOST,
            port=self.POSTGRESQL_PORT,
            path=self.POSTGRESQL_DATABASE,
        )

    # Redis configuration settings
    REDIS_SCHEME: str = "redis"
    REDIS_MAX_CONNECTIONS: int = 10
    REDIS_ROOT_USERNAME: str = ""
    REDIS_ROOT_PASSWORD: Secret[str]
    REDIS_HOST: str
    REDIS_PORT: int = Field(6379, ge=0, le=65535)
    REDIS_DATABASE: int = Field(0, ge=0, le=15)

    @property
    def REDIS_URL(self) -> RedisDsn:
        """生成并返回 Redis 连接 URL。"""
        return RedisDsn.build(
            scheme=self.REDIS_SCHEME,
            username=self.REDIS_ROOT_USERNAME,
            password=self.REDIS_ROOT_PASSWORD.get_secret_value(),
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            path=str(self.REDIS_DATABASE),
        )

    CELERY_REDIS_DATABASE: int = Field(1, ge=0, le=15)
    DATETIME_TIMEZONE: str = "Asia/Shanghai"
    DATETIME_FORMAT: str = "%Y-%m-%d %H:%M:%S"

    @property
    def CELERY_REDIS_URL(self) -> RedisDsn:
        """生成并返回 Celery Redis 连接 URL。"""

        return RedisDsn.build(
            scheme=self.REDIS_SCHEME,
            username=self.REDIS_ROOT_USERNAME,
            password=self.REDIS_ROOT_PASSWORD.get_secret_value(),
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            path=str(self.CELERY_REDIS_DATABASE),
        )

    # Minio configuration settings
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: Secret[str]

    # Current environment (e.g., TESTING, PRODUCTION)
    ENVIRONMENT: Environment = Environment.PRODUCTION

    # noinspection PyNestedDecorators
    @field_validator("ENVIRONMENT")
    @classmethod
    def environment_validator(cls, environment: Environment) -> Environment:
        """本地环境警告：在本地环境运行时发出警告。"""
        if environment.value == Environment.LOCAL:
            warnings.warn(
                "The application is currently running in the local environment. "
                "Make sure to update environment-specific settings before deploying to production.",
                RuntimeWarning,
            )
        return environment

    # Cors settings
    CORS_ORIGINS: list[str]
    CORS_ORIGINS_REGEX: str | None = None
    CORS_HEADERS: list[str]

    API_PREFIX_V1: str = "/api/v1"

    # App version
    APP_VERSION: str = "0.1.0"

    # Logging
    LOG_LEVEL: LOG_LEVELS = "INFO"
    LOG_FILE_ACCESS_LEVEL: LOG_LEVELS = "INFO"
    LOG_FILE_ERROR_LEVEL: LOG_LEVELS = "WARNING"

    LOG_ACCESS_FILENAME: str = "access.log"
    LOG_ERROR_FILENAME: str = "error.log"

    LOG_FORMAT: str = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</> | <lvl>{level: <8}</> | <cyan>{request_id}</> | <lvl>{message}</>"
    )

    # I18n settings
    DEFAULT_LANGUAGE: LANGUAGE_TYPE = "zh-CN"

    # Rate limiting settings
    DEFAULT_LIMITS: list[StrOrCallableStr] = ["20/minute"]

    # Socketio Admin settings
    SOCKETIO_ADMIN_USERNAME: str = "admin"
    SOCKETIO_ADMIN_PASSWORD: Secret[str] = Secret("123456")


settings = Config()  # type: ignore


class AuthConfig(BaseSettings):
    """认证配置。"""

    JWT_ALG: str = "HS256"

    ACCESS_TOKEN_KEY: AccessSecret
    ACCESS_TOKEN_EXP: timedelta = timedelta(seconds=1 * DAYS)

    REFRESH_TOKEN_KEY: RefreshSecret
    REFRESH_TOKEN_EXP: timedelta = timedelta(seconds=1 * WEEKS)

    RSA_PRIVATE_KEY: RSAPrivateKey
    RSA_PUBLIC_KEY: Secret[str]

    # noinspection PyNestedDecorators
    @field_validator("ACCESS_TOKEN_EXP", "REFRESH_TOKEN_EXP", mode="before")
    @classmethod
    def set_token_expires(cls, expires: str) -> timedelta:
        """
        将令牌过期配置转换为 timedelta。

        该校验器支持以 timedelta 对象或字符串/整数秒数形式配置的值（例如来自环境变量）。

        Args:
            expires: 配置的过期时间。

        Returns:
            有效的 timedelta，表示过期持续时间。
        """

        if isinstance(expires, timedelta):
            return expires

        return timedelta(seconds=int(expires))

    # noinspection PyNestedDecorators
    @model_validator(mode="before")
    @classmethod
    def ensure_keys_config(cls, auth: dict) -> dict:
        """
        确保环境中已配置 ACCESS_TOKEN_KEY 和 REFRESH_TOKEN_KEY。

        如果缺少密钥，在已部署环境中会引发错误；在非部署环境中会动态生成新的密钥。

        Raises:
            ValueError: 如果在部署环境中缺少密钥。
        """
        message = """
            Please configure `{field}` in your `.env` file.
            Do not generate it dynamically at runtime, especially in distributed environments.
            Using a fixed key ensures consistent token verification across multiple services or instances.
        """
        cls.ensure_key_exists(auth, "ACCESS_TOKEN_KEY", message)
        cls.ensure_key_exists(auth, "REFRESH_TOKEN_KEY", message)

        rsa_private = auth.get("RSA_PRIVATE_KEY")
        rsa_public = auth.get("RSA_PUBLIC_KEY")
        if not rsa_private or not rsa_public:
            if settings.ENVIRONMENT.is_deployed:
                raise ConfigError(message.format(field="RSA_PRIVATE_KEY or RSA_PUBLIC_KEY"))
            private_key, public_key = generate_rsa_key_pair()

            auth["RSA_PRIVATE_KEY"], auth["RSA_PUBLIC_KEY"] = private_key, serialize_key(public_key)

        else:
            try:
                auth["RSA_PRIVATE_KEY"] = load_private_key(cls.load_rsa_key(auth["RSA_PRIVATE_KEY"]))
                auth["RSA_PUBLIC_KEY"] = cls.load_rsa_key(auth["RSA_PUBLIC_KEY"])
            except Exception as e:
                raise ConfigError(f"""
                        Please check the configuration for `RSA_PRIVATE_KEY` or `RSA_PUBLIC_KEY`.
                        Error: {str(e)}.
                    """)

        return auth

    @classmethod
    def ensure_key_exists(cls, auth: dict, key: str, message: str) -> None:
        """
        确保指定的键存在于 `auth` 字典中。

        如果键不存在，则使用 `secrets.token_urlsafe(32)` 生成新值；在已部署环境中则抛出错误。

        Args:
            auth: 要检查并可能添加键的字典。
            key: 要检查的键名称。
            message: 当键缺失且为已部署环境时用于抛出错误的消息模板。

        Raises:
            ValueError: 如果在已部署环境中缺少该键。

        Returns:
            无。该方法不返回值；要么将键添加到 `auth`，要么抛出错误。
        """
        if not auth.get(key):
            if settings.ENVIRONMENT.is_deployed:
                raise ConfigError(message.format(field=key))
            auth[key] = secrets.token_urlsafe(32)

    @classmethod
    def load_rsa_key(cls, key: str) -> str:
        """
        如果提供的 `key` 是文件路径，则从文件加载 RSA 密钥；否则直接返回该 `key`。

        本函数检查 `key` 是否包含目录分隔符（例如 `/` 或 `\\`），
        若包含则尝试读取文件内容；文件不存在时抛出错误。

        Args:
            key: RSA 私钥或公钥，可为文件路径或原始字符串。

        Raises:
            ValueError: 当 `key` 包含目录分隔符但路径不存在时。

        Returns:
            RSA 密钥字符串（文件内容或原始提供的 `key`）。
        """
        if re.search(r"[\\/]", key):
            if not os.path.exists(key):
                raise ConfigError("'RSA_PRIVATE_KEY' or 'RSA_PUBLIC_KEY' path does not exist.")

            with open(key, "r", encoding="utf-8") as file:
                return file.read()

        return key


auth_settings = AuthConfig()  # type: ignore

app_configs: dict[str, Any] = {"title": "FastAPI MultiDB"}

# Disable the OpenAPI documentation in non-debug environments
if not settings.ENVIRONMENT.is_debug:
    app_configs["openapi_url"] = None

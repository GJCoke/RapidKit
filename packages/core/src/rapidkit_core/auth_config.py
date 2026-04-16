"""
Auth Config settings.

Separated from config.py during plugin architecture migration.
AuthConfig and related settings remain in the backend app.

Author : Coke
Date   : 2025-03-11
"""

import os
import re
import secrets
from datetime import timedelta
from typing import Any

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from pydantic import Secret, field_validator, model_validator

from rapidkit_core.config import BaseSettings, ConfigError, settings
from rapidkit_core.constants import DAYS, WEEKS
from rapidkit_core.security import AccessSecret, RefreshSecret, generate_rsa_key_pair, load_private_key, serialize_key


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

"""JWT token creation and decoding."""

from datetime import UTC, datetime, timedelta
from typing import overload
from uuid import UUID

from authlib.jose import jwt
from pydantic import BaseModel

from rapidkit_security.types import AccessSecret, RefreshSecret


class AccessJWT(BaseModel):
    """JWT 访问令牌中包含的用户信息。"""

    sub: UUID
    name: str
    jti: UUID


class RefreshJWT(AccessJWT):
    """JWT 刷新令牌中包含的用户信息。"""

    agent: str


def create_token(
    user: AccessJWT,
    expires_delta: timedelta,
    key: AccessSecret | RefreshSecret,
    alg: str,
) -> str:
    """
    创建 JWT 访问令牌。

    Args:
        user: 要编码到令牌中的用户信息。
        expires_delta: 令牌过期时长。
        key: 用于签名 JWT 的密钥。
        alg: 签名算法。

    Returns:
        生成的 JWT 字符串。
    """
    header = dict(alg=alg, typ="JWT")
    payload = user.model_dump(mode="json")
    payload["exp"] = datetime.now(UTC) + expires_delta

    return jwt.encode(header=header, payload=payload, key=key.get_secret_value()).decode("utf-8")


@overload
def decode_token(token: str, key: AccessSecret) -> AccessJWT: ...


@overload
def decode_token(token: str, key: RefreshSecret) -> RefreshJWT: ...


def decode_token(token: str, key: AccessSecret | RefreshSecret) -> AccessJWT | RefreshJWT:
    """
    解码并校验 JWT 令牌，返回对应的用户信息。

    Args:
        token: 待解码的 JWT 字符串。
        key: 用于校验签名的密钥。

    Returns:
        解码后的用户信息。

    Raises:
        JoseError: 令牌无效或解码失败时抛出。
    """
    payload = jwt.decode(token, key=key.get_secret_value())
    payload.validate()

    return AccessJWT(**payload) if isinstance(key, AccessSecret) else RefreshJWT(**payload)

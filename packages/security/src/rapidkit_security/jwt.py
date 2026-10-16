"""JWT token creation and decoding."""

from datetime import UTC, datetime, timedelta
from typing import Literal, overload
from uuid import UUID

from authlib.jose import JsonWebToken, jwt
from pydantic import BaseModel, ConfigDict

from rapidkit_security.types import AccessSecret, ImpersonationSecret, RefreshSecret


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


class ImpersonationJWT(BaseModel):
    """模拟会话令牌；到期时间由会话创建者固定。"""

    model_config = ConfigDict(extra="forbid")

    token_type: Literal["impersonation"]
    sub: UUID
    act: UUID
    sid: UUID
    jti: UUID
    exp: int


def create_impersonation_token(claims: ImpersonationJWT, key: ImpersonationSecret, alg: str) -> str:
    """使用独立密钥签发令牌，保留会话的固定到期时间。"""
    codec = JsonWebToken([alg])
    return codec.encode(
        {"alg": alg, "typ": "JWT"},
        claims.model_dump(mode="json"),
        key.get_secret_value(),
    ).decode("utf-8")


def decode_impersonation_token(
    token: str,
    key: ImpersonationSecret,
    alg: str,
    *,
    allow_expired: bool = False,
) -> ImpersonationJWT:
    """验证模拟令牌；停止会话时只允许跳过过期校验。"""
    codec = JsonWebToken([alg])
    payload = codec.decode(token, key.get_secret_value())
    if allow_expired:
        # Keep signature, algorithm and all other registered-claim checks active.
        expiration = payload.pop("exp", None)
        try:
            payload.validate()
        finally:
            if expiration is not None:
                payload["exp"] = expiration
    else:
        payload.validate()
    return ImpersonationJWT.model_validate(dict(payload))

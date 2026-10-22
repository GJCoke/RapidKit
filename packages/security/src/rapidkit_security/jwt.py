"""JWT token creation and decoding."""

import time
from datetime import timedelta
from typing import Annotated, Literal, overload
from uuid import UUID

from authlib.jose import JsonWebToken
from authlib.jose.errors import UnsupportedAlgorithmError
from pydantic import BaseModel, ConfigDict, Field

from rapidkit_security.types import AccessSecret, ImpersonationSecret, RefreshSecret

_codec = JsonWebToken(["HS256"])
_NumericDate = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class AccessJWT(BaseModel):
    """JWT 访问令牌中包含的用户信息。"""

    sub: UUID
    name: str
    jti: UUID
    iat: _NumericDate | None = None
    exp: _NumericDate | None = None


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
    if alg != "HS256":
        raise UnsupportedAlgorithmError()
    header = dict(alg="HS256", typ="JWT")
    payload = user.model_dump(mode="json")
    payload["iat"] = time.time()
    payload["exp"] = payload["iat"] + expires_delta.total_seconds()

    return _codec.encode(header=header, payload=payload, key=key.get_secret_value()).decode("utf-8")


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
    payload = _codec.decode(token, key=key.get_secret_value(), claims_options={"exp": {"essential": True}})
    # Authlib's default clock truncates seconds and rejects freshly issued fractional iat.
    payload.validate(now=time.time())

    return AccessJWT(**payload) if isinstance(key, AccessSecret) else RefreshJWT(**payload)


class ImpersonationJWT(BaseModel):
    """模拟会话令牌；到期时间由会话创建者固定。"""

    model_config = ConfigDict(extra="forbid")

    token_type: Literal["impersonation"]
    sub: UUID
    act: UUID
    sid: UUID
    jti: UUID
    exp: Annotated[int, Field(strict=True)]
    iat: _NumericDate | None = None


def create_impersonation_token(claims: ImpersonationJWT, key: ImpersonationSecret, alg: str) -> str:
    """使用独立密钥签发令牌，保留会话的固定到期时间。"""
    if alg != "HS256":
        raise UnsupportedAlgorithmError()
    payload = claims.model_dump(mode="json", exclude_none=True)
    payload.setdefault("iat", time.time())
    return _codec.encode(
        {"alg": "HS256", "typ": "JWT"},
        payload,
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
    if alg != "HS256":
        raise UnsupportedAlgorithmError()
    payload = _codec.decode(token, key.get_secret_value())
    if allow_expired:
        # Keep signature, algorithm and all other registered-claim checks active.
        expiration = payload.pop("exp", None)
        try:
            payload.validate(now=time.time())
        finally:
            if expiration is not None:
                payload["exp"] = expiration
    else:
        payload.validate(now=time.time())
    return ImpersonationJWT.model_validate(dict(payload))

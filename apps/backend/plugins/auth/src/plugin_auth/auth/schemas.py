"""
认证相关数据结构。

Author : Coke
Date   : 2025-03-13
"""

from typing import Literal

from pydantic import BaseModel as PydanticBaseModel
from pydantic import EmailStr, Field
from rapidkit_common.schemas import BaseModel, BaseRequest, BaseResponse, ResponseSchema
from rapidkit_core.config import settings


class LoginRequest(BaseRequest):
    """登录请求数据结构。"""

    username: str
    password: str


class UserSchema(BaseModel):
    """用户数据结构。"""

    name: str
    email: EmailStr
    username: str
    is_admin: bool = False
    roles: list[str] = []
    buttons: list[str] = []
    restricted_fields: dict[str, dict[str, Literal["masked", "hidden"]]] = {}


class UserInfoResponse(UserSchema, ResponseSchema):
    """用户信息响应数据结构。"""

    timezone: str = Field(default_factory=lambda: settings.DATETIME_TIMEZONE)


class OAuth2TokenResponse(PydanticBaseModel):
    """OAuth2 令牌响应。"""

    access_token: str
    token_type: str


class TokenResponse(BaseResponse):
    """令牌响应。"""

    access_token: str
    refresh_token: str


class RefreshTokenCache(PydanticBaseModel):
    """Redis 中存储的刷新令牌缓存数据结构。"""

    token: str
    agent: str
    created_at: int

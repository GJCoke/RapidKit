"""
认证相关数据结构。

Author : Coke
Date   : 2025-03-13
"""

from pydantic import BaseModel as PydanticBaseModel
from pydantic import EmailStr
from rapidkit_common.schemas import BaseModel, BaseRequest, BaseResponse, ResponseSchema


class LoginRequest(BaseRequest):
    """登录请求数据结构。"""

    username: str
    password: str


class RefreshTokenRequest(BaseRequest):
    """刷新令牌请求数据结构。"""

    refresh_token: str


class UserSchema(BaseModel):
    """用户数据结构。"""

    name: str
    email: EmailStr
    username: str
    is_admin: bool = False
    roles: list[str] = []
    buttons: list[str] = []


class UserInfoResponse(UserSchema, ResponseSchema):
    """用户信息响应数据结构。"""


class UserCreate(UserSchema, BaseRequest):
    """创建用户请求数据结构。"""

    password: str


class UserUpdate(UserSchema, BaseRequest):
    """更新用户请求数据结构。"""


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

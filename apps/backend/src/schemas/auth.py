"""
认证相关数据结构。

为什么要将请求模型、响应模型和数据库模型分离？不能只用一个模型吗？

- 每个模型专注于各自的职责，代码更易维护。
- 请求和响应模型利用 Pydantic 进行数据校验，确保数据结构符合预期。
- 分离请求和响应模型可避免返回敏感数据库字段（如密码），提升安全性。
- 各层可独立扩展或修改，如修改数据库模型字段不会影响请求/响应模型。
- 明确的输入输出结构防止混淆。
- 各模型职责清晰，便于单元测试。
- 分层设计便于替换、扩展或修改任意一层而不影响其他层。

Author : Coke
Date   : 2025-03-13
"""

from uuid import UUID

from pydantic import BaseModel as PydanticBaseModel
from pydantic import EmailStr, Field

from src.schemas import BaseModel, BaseRequest, BaseResponse, ResponseSchema


class UserAccessJWT(BaseRequest):
    """JWT 访问令牌中包含的用户信息。"""

    user_id: UUID = Field(..., alias="sub")
    name: str
    jti: UUID


class UserRefreshJWT(UserAccessJWT):
    """JWT 刷新令牌中包含的用户信息。"""

    agent: str


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
    roles: list[str] = []
    buttons: list[str] = []


class UserInfoResponse(UserSchema, ResponseSchema):
    """用户信息响应数据结构。"""


class UserCreate(UserSchema, BaseRequest):
    """创建用户请求数据结构。"""

    is_admin: bool = False
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

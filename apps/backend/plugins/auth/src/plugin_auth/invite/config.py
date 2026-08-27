"""Invite configuration for SMTP delivery, frontend links, and token expiry."""

from datetime import timedelta

from pydantic import field_validator
from rapidkit_core.config import BaseSettings


class InviteConfig(BaseSettings):
    """邀请流程配置（SMTP + 前端链接 + 令牌过期）。"""

    INVITE_TOKEN_EXP: timedelta = timedelta(hours=48)
    FRONTEND_BASE_URL: str = "http://localhost:9527"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@rapidkit.local"
    SMTP_USE_TLS: bool = True

    @field_validator("INVITE_TOKEN_EXP", mode="before")
    @classmethod
    def set_token_expires(cls, expires: str | int | timedelta) -> timedelta:
        """将秒数形式的配置转换为 ``timedelta``。"""
        if isinstance(expires, timedelta):
            return expires
        return timedelta(seconds=int(expires))


invite_settings = InviteConfig()

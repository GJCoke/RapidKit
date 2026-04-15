"""
速率限制服务封装。

Author : Coke
Date   : 2025-03-10
"""

from typing import Callable, Optional

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from rapidkit_core.config import settings


class RateLimiterService:
    """速率限制服务，提供统一的限制配置和策略管理。"""

    _limiter: Optional[Limiter] = None

    @classmethod
    def init_limiter(cls) -> Limiter:
        if cls._limiter is None:
            cls._limiter = Limiter(
                key_func=cls._default_key_func,
                default_limits=settings.DEFAULT_LIMITS,
                storage_uri=str(settings.REDIS_URL),
            )
        return cls._limiter

    @classmethod
    def get_limiter(cls) -> Limiter:
        if cls._limiter is None:
            cls.init_limiter()
        return cls._limiter  # type: ignore

    @staticmethod
    def _default_key_func(request: Request) -> str:
        return get_remote_address(request)

    @staticmethod
    def key_by_ip(request: Request) -> str:
        return get_remote_address(request)

    @staticmethod
    def key_by_user_id(request: Request) -> str:
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user_{user_id}"
        return get_remote_address(request)

    @staticmethod
    def key_by_user_or_ip(request: Request) -> str:
        return RateLimiterService.key_by_user_id(request)

    @staticmethod
    def key_by_custom(key_func: Callable[[Request], str]) -> Callable[[Request], str]:
        return key_func

    @staticmethod
    def create_composite_key(*args: str, separator: str = "::") -> str:
        return separator.join(args)


def get_rate_limiter() -> Limiter:
    return RateLimiterService.get_limiter()


def rate_limit_by_ip() -> Callable[[Request], str]:
    return RateLimiterService.key_by_ip


def rate_limit_by_user() -> Callable[[Request], str]:
    return RateLimiterService.key_by_user_id


def rate_limit_by_user_or_ip() -> Callable[[Request], str]:
    return RateLimiterService.key_by_user_or_ip

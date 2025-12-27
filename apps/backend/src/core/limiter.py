"""
速率限制服务封装。

提供灵活的速率限制配置，支持多种键生成策略（IP、用户ID、自定义等）。

Author : Coke
Date   : 2025-03-10
"""

from typing import Callable, Optional

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from src.core.config import settings


class RateLimiterService:
    """速率限制服务，提供统一的限制配置和策略管理。"""

    _limiter: Optional[Limiter] = None

    @classmethod
    def init_limiter(cls) -> Limiter:
        """
        初始化限制器。

        Returns:
            Limiter: 初始化的限制器实例

        Note:
            这个方法应该在应用启动时调用一次。
        """
        if cls._limiter is None:
            cls._limiter = Limiter(
                key_func=cls._default_key_func,
                default_limits=settings.DEFAULT_LIMITS,
                storage_uri=str(settings.REDIS_URL),
            )
        return cls._limiter

    @classmethod
    def get_limiter(cls) -> Limiter:
        """
        获取限制器实例。

        Returns:
            Limiter: 已初始化的限制器实例
        """
        if cls._limiter is None:
            cls.init_limiter()
        return cls._limiter  # type: ignore

    @staticmethod
    def _default_key_func(request: Request) -> str:
        """
        默认的键生成函数，基于远程地址（IP）。

        Args:
            request: FastAPI 请求对象

        Returns:
            str: IP 地址
        """
        return get_remote_address(request)

    @staticmethod
    def key_by_ip(request: Request) -> str:
        """
        基于 IP 地址的键生成函数。

        Args:
            request: FastAPI 请求对象

        Returns:
            str: IP 地址
        """
        return get_remote_address(request)

    @staticmethod
    def key_by_user_id(request: Request) -> str:
        """
        基于用户 ID 的键生成函数。

        从请求状态或认证信息获取用户 ID。
        如果用户未认证，则回退到 IP 地址。

        Args:
            request: FastAPI 请求对象

        Returns:
            str: 用户ID或IP地址
        """
        # 尝试从请求状态获取用户ID
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user_{user_id}"

        return get_remote_address(request)

    @staticmethod
    def key_by_user_or_ip(request: Request) -> str:
        """
        优先使用用户ID，否则使用IP地址。

        Args:
            request: FastAPI 请求对象

        Returns:
            str: 用户ID或IP地址
        """
        return RateLimiterService.key_by_user_id(request)

    @staticmethod
    def key_by_custom(key_func: Callable[[Request], str]) -> Callable[[Request], str]:
        """
        创建自定义键生成函数。

        Args:
            key_func: 自定义的键生成函数

        Returns:
            Callable: 自定义的键生成函数
        """
        return key_func

    @staticmethod
    def create_composite_key(
        *args: str,
        separator: str = "::",
    ) -> str:
        """
        创建复合键，用于多维限制。

        Args:
            *args: 键的组件
            separator: 分隔符

        Returns:
            str: 组合的键
        """
        return separator.join(args)


# 快速访问的常用键函数
def get_rate_limiter() -> Limiter:
    """获取全局限制器实例。"""
    return RateLimiterService.get_limiter()


def rate_limit_by_ip() -> Callable[[Request], str]:
    """获取基于IP的限制函数。"""
    return RateLimiterService.key_by_ip


def rate_limit_by_user() -> Callable[[Request], str]:
    """获取基于用户ID的限制函数。"""
    return RateLimiterService.key_by_user_id


def rate_limit_by_user_or_ip() -> Callable[[Request], str]:
    """获取优先用户ID，回退IP的限制函数。"""
    return RateLimiterService.key_by_user_or_ip

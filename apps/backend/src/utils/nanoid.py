"""
Nanoid 插件实现。

作者 : Coke
日期 : 2025-12-23
"""

import re

from nanoid import generate
from nanoid.resources import alphabet as default_alphabet
from starlette.datastructures import MutableHeaders
from starlette.requests import HTTPConnection, Request
from starlette.responses import Response
from starlette.types import Message
from starlette_context import context
from starlette_context.errors import MiddleWareValidationError
from starlette_context.header_keys import HeaderKeys
from starlette_context.plugins import Plugin


def get_request_nanoid(default: str = "-") -> str:
    """
    获取当前请求的 Nanoid。

    Returns:
        当前请求的 Nanoid 字符串，若不存在则返回默认值 settings.NANOID_LOG_DEFAULT_VALUE
    """
    if context.exists():
        return context.get(HeaderKeys.request_id, default)
    return default


class WrongNanoIdError(MiddleWareValidationError):
    """
    Nanoid 格式错误异常。
    """


class NanoIdPlugin(Plugin):
    """
    基于 starlette_context 的 Nanoid 插件。

    类似于 RequestIdPlugin，但使用 Nanoid 代替 UUID。
    支持从请求头提取、强制生成新值、格式校验，并在响应头中回写。
    """

    key: str = HeaderKeys.api_key

    def __init__(
        self,
        force_new_nanoid: bool = False,
        size: int = 21,
        alphabet: str | None = None,
        validate: bool = True,
        error_response: Response | None = None,
    ) -> None:
        """
        初始化 NanoIdPlugin。

        Args:
            force_new_nanoid: 是否强制为每个请求生成新的 Nanoid，忽略请求头中已存在的值。
            size: Nanoid 的长度，默认 21。
            alphabet: 自定义字母表，默认为 None（使用默认字母表）。
            validate: 是否校验请求头中的 Nanoid 格式。
            error_response: 校验失败时返回的错误响应。
        """
        self.force_new_nanoid = force_new_nanoid
        self.size = size
        self.alphabet = alphabet or default_alphabet
        self.validate = validate
        self.error_response = error_response

    def get_new_nanoid(self) -> str:
        """
        生成一个新的 Nanoid。

        Returns:
            生成的 Nanoid 字符串。
        """
        return generate(self.alphabet, self.size)

    def validate_nanoid(self, nanoid_to_validate: str) -> None:
        """
        校验 Nanoid 格式是否合法。

        Args:
            nanoid_to_validate: 待校验的 Nanoid 字符串。

        Raises:
            WrongNanoIdError: 如果 Nanoid 格式不正确。
        """
        if not nanoid_to_validate:
            raise WrongNanoIdError("Nanoid cannot be empty", error_response=self.error_response)

        if len(nanoid_to_validate) != self.size:
            raise WrongNanoIdError(
                f"Nanoid length should be {self.size}, got {len(nanoid_to_validate)}",
                error_response=self.error_response,
            )

        pattern = f"^[{re.escape(self.alphabet)}]+$"
        if not re.match(pattern, nanoid_to_validate):
            raise WrongNanoIdError(
                "Nanoid contains invalid characters",
                error_response=self.error_response,
            )

    async def extract_value_from_header_by_key(self, request: Request | HTTPConnection) -> str:
        """
        从请求头中提取 Nanoid，如不存在或强制生成则创建新值。

        Args:
            request: Starlette 请求或 HTTP 连接对象。

        Returns:
            提取或生成的 Nanoid 字符串。
        """
        value = await super().extract_value_from_header_by_key(request)

        if self.force_new_nanoid or not value:
            value = self.get_new_nanoid()

        if self.validate:
            self.validate_nanoid(value)

        return value

    async def process_request(self, request: Request | HTTPConnection) -> str:
        """
        处理请求，提取或生成 Nanoid。

        Args:
            request: Starlette 请求或 HTTP 连接对象。

        Returns:
            Nanoid 字符串。
        """
        return await self.extract_value_from_header_by_key(request)

    async def enrich_response(self, arg: Response | Message) -> None:
        """
        在响应头中添加 Nanoid。

        Args:
            arg: 响应对象或消息字典。
        """
        value = str(context.get(self.key))

        if isinstance(arg, Response):
            arg.headers[self.key] = value
        else:
            if arg["type"] == "http.response.start":
                headers = MutableHeaders(scope=arg)
                headers.append(self.key, value)

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
    """获取当前请求的 Nanoid。"""
    if context.exists():
        return context.get(HeaderKeys.request_id, default)
    return default


class WrongNanoIdError(MiddleWareValidationError):
    """Nanoid 格式错误异常。"""


class NanoIdPlugin(Plugin):
    """基于 starlette_context 的 Nanoid 插件。"""

    key: str = HeaderKeys.request_id

    def __init__(
        self,
        force_new_nanoid: bool = False,
        size: int = 21,
        alphabet: str | None = None,
        validate: bool = True,
        error_response: Response | None = None,
    ) -> None:
        self.force_new_nanoid = force_new_nanoid
        self.size = size
        self.alphabet = alphabet or default_alphabet
        self.validate = validate
        self.error_response = error_response

    def get_new_nanoid(self) -> str:
        return generate(self.alphabet, self.size)

    def validate_nanoid(self, nanoid_to_validate: str) -> None:
        if not nanoid_to_validate:
            raise WrongNanoIdError("Nanoid cannot be empty", error_response=self.error_response)
        if len(nanoid_to_validate) != self.size:
            raise WrongNanoIdError(
                f"Nanoid length should be {self.size}, got {len(nanoid_to_validate)}",
                error_response=self.error_response,
            )
        pattern = f"^[{re.escape(self.alphabet)}]+$"
        if not re.match(pattern, nanoid_to_validate):
            raise WrongNanoIdError("Nanoid contains invalid characters", error_response=self.error_response)

    async def extract_value_from_header_by_key(self, request: Request | HTTPConnection) -> str:
        value = await super().extract_value_from_header_by_key(request)
        if self.force_new_nanoid or not value:
            value = self.get_new_nanoid()
        if self.validate:
            self.validate_nanoid(value)
        return value

    async def process_request(self, request: Request | HTTPConnection) -> str:
        return await self.extract_value_from_header_by_key(request)

    async def enrich_response(self, arg: Response | Message) -> None:
        value = str(context.get(self.key))
        if isinstance(arg, Response):
            arg.headers[self.key] = value
        else:
            if arg["type"] == "http.response.start":
                headers = MutableHeaders(scope=arg)
                headers.append(self.key, value)

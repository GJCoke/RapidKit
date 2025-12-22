"""
Custom Request and APIRoute class.

Description.

Author : Coke
Date   : 2025-03-12
"""

from typing import Any

from fastapi.routing import APIRoute

from src.schemas.response import RESPONSES


class BaseRoute(APIRoute):
    """自定义路由类。"""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        """
        设置 responses 状态码的多种返回值。

        可以在 RESPONSES 中添加响应信息，
        但所有 APIRouter 实例都需要将 route_class 设置为 BaseRoute。

        Example:
            @app.post("/login", responses={
                400: {"description": "Bad request.", "model": BadRequestResponse},
                422: {"description": "Validation error.", "model": ValidationErrorResponse},
            })
            async def login():
                pass
        """
        kwargs["responses"] = {**RESPONSES, **kwargs.get("responses", {})}
        super().__init__(*args, **kwargs)

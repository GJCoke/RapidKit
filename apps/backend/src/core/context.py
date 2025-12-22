from typing import Any, Protocol

from starlette_context.ctx import _Context, context


class TypedContextProtocol(Protocol):
    """
    上下文类型协议，定义了请求上下文中可用的属性。
    """

    ip: str

    user_agent: str
    os: str | None
    browser: str | None
    device: str | None

    language: str


class TypedContext(TypedContextProtocol, _Context):
    """
    带类型的上下文对象，支持属性访问和赋值。
    """

    def __getattr__(self, name: str) -> Any:
        """
        获取上下文中的属性。

        Args:
            name: 属性名。

        Returns:
            属性值。
        """
        return context.get(name)

    def __setattr__(self, name: str, value: Any) -> None:
        """
        设置上下文中的属性。

        Args:
            name: 属性名。
            value: 属性值。
        """
        context[name] = value


ctx = TypedContext()

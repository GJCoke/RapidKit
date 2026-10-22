from fastapi import Request
from user_agents import parse
from user_agents.parsers import UserAgent as UAParser

from rapidkit_common.schemas.request import UserAgent


def get_client_ip(request: Request) -> str | None:
    # ProxyHeadersMiddleware is the single authority for forwarded client addresses.
    if request.client is None:
        return None
    return "127.0.0.1" if request.client.host == "testclient" else request.client.host


def parse_user_agent(request: Request) -> UserAgent | None:
    """
    解析请求头中的 user-agent 字符串，提取设备、操作系统与浏览器信息。

    Args:
        request: 包含请求头的 HTTP 请求对象。

    Returns:
        UserAgent 对象，包含解析后的 user-agent 字符串、设备、操作系统和浏览器信息；
        若请求头中不存在 user-agent，返回 None。
    """

    user_agent_str = request.headers.get("user-agent")
    if not user_agent_str:
        return None

    user_agent: UAParser = parse(user_agent_str)
    os: str = user_agent.get_os()
    browser: str = user_agent.get_browser()
    device: str = user_agent.get_device()

    return UserAgent(
        user_agent=user_agent_str,
        device=device,
        os=os,
        browser=browser,
    )

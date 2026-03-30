import ipaddress

from fastapi import Request
from user_agents import parse
from user_agents.parsers import UserAgent as UAParser

from src.common.schemas.request import UserAgent


def get_client_ip(request: Request) -> str | None:
    headers = request.headers

    # Cloudflare
    cf_ip = headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip

    # X-Forwarded-For
    xff = headers.get("x-forwarded-for")
    if xff:
        ip = xff.split(",")[0].strip()
        if _is_valid_ip(ip):
            return ip

    # X-Real-IP
    real_ip = headers.get("x-real-ip")
    if real_ip and _is_valid_ip(real_ip):
        return real_ip

    # pytest TestClient
    if request.client and request.client.host == "testclient":
        return "127.0.0.1"

    # fallback
    if request.client:
        return request.client.host


def _is_valid_ip(ip: str) -> bool:
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


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

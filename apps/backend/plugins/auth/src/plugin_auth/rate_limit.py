"""Signature-only rate identities and sensitive endpoint policies."""

import hashlib
import json
from urllib.parse import parse_qs

from authlib.jose.errors import JoseError
from fastapi import FastAPI
from pydantic import ValidationError
from rapidkit_core.config import settings
from rapidkit_framework.limiter import RateLimitRule
from rapidkit_security import decode_impersonation_token, decode_token
from starlette.requests import Request

from plugin_auth.auth_config import auth_settings


async def configure_rate_limits(app: FastAPI) -> None:
    """Install auth-owned policy through the plugin lifecycle, before serving requests."""
    app.state.rate_limit_rules = rate_limit_rules


def _identity(token: str, *, refresh: bool = False) -> str | None:
    try:
        key = auth_settings.REFRESH_TOKEN_KEY if refresh else auth_settings.ACCESS_TOKEN_KEY
        return str(decode_token(token, key).sub)
    except JoseError, ValidationError, ValueError, TypeError:
        if not refresh:
            try:
                return str(
                    decode_impersonation_token(token, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG).sub
                )
            except JoseError, ValidationError, ValueError, TypeError:
                pass
        return None


def _account_key(ip: str, account: str) -> str:
    return hashlib.sha256(json.dumps([ip, account], ensure_ascii=False).encode()).hexdigest()


async def _account(request: Request, field: str) -> str | None:
    raw = await request.body()
    if request.url.path.endswith("/login/swagger"):
        try:
            value = parse_qs(raw.decode()).get(field, [None])[0]
        except UnicodeDecodeError, ValueError:
            return None
    else:
        try:
            body = json.loads(raw)
        except json.JSONDecodeError, UnicodeDecodeError:
            return None
        value = body.get(field) if isinstance(body, dict) else None
    return value if isinstance(value, str) else None


async def rate_limit_rules(request: Request) -> list[RateLimitRule]:
    ip = request.client.host if request.client else "unknown"
    ip_key = f"ip:{ip}"
    authorization = request.headers.get("authorization", "")
    token = authorization[7:] if authorization.lower().startswith("bearer ") else ""
    user_id = _identity(token) if token else None
    rules = [
        (
            "default",
            f"user:{user_id}" if user_id else ip_key,
            settings.RATE_LIMIT_AUTHENTICATED if user_id else settings.RATE_LIMIT_ANONYMOUS,
        )
    ]
    path = request.url.path.removeprefix(settings.API_PREFIX_V1)
    if request.method == "POST" and path in ("/auth/login", "/auth/login/swagger"):
        username = await _account(request, "username")
        if username is not None:
            rules.append(("login-account", _account_key(ip, username), settings.RATE_LIMIT_LOGIN_ACCOUNT))
        rules.append(("login-ip", ip_key, settings.RATE_LIMIT_LOGIN_IP))
    elif request.method == "POST" and path == "/auth/password-reset/request":
        email = await _account(request, "email")
        if email is not None:
            rules.append(
                ("reset-account", _account_key(ip, email.strip().casefold()), settings.RATE_LIMIT_RESET_ACCOUNT)
            )
        rules.append(("reset-ip", ip_key, settings.RATE_LIMIT_RESET_IP))
    elif request.method == "POST" and path == "/auth/token/refresh":
        refresh_user = _identity(request.headers.get("x-refresh-token", ""), refresh=True)
        rules.append(("refresh", f"user:{refresh_user}" if refresh_user else ip_key, settings.RATE_LIMIT_REFRESH))
    elif (request.method, path) in {
        ("GET", "/auth/invite/validate"),
        ("POST", "/auth/invite/set-password"),
        ("GET", "/auth/password-reset/validate"),
        ("POST", "/auth/password-reset/confirm"),
    }:
        rules.append(("credential-setup", ip_key, settings.RATE_LIMIT_CREDENTIAL_SETUP))
    return rules

"""Rate policies use signed identities, stack sensitive quotas and preserve request bodies."""

import json
from datetime import timedelta
from uuid import uuid4

import pytest
from authlib.jose import JsonWebToken
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from plugin_auth import register
from plugin_auth.auth_config import auth_settings
from plugin_auth.rate_limit import rate_limit_rules
from rapidkit_core.config import settings
from rapidkit_framework.limiter import RateLimiterService
from rapidkit_framework.status_codes import StatusCode
from rapidkit_security import AccessJWT, ImpersonationJWT, RefreshJWT, create_impersonation_token, create_token
from src.middlewares.limiter import RateLimitMiddleware
from starlette.requests import Request
from tests.testing.fixtures import pytest_settings


@pytest.mark.asyncio
async def test_auth_startup_installs_sensitive_policy(redis, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "10000/minute")
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_IP", "10000/minute")
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_ACCOUNT", "1/minute")
    app = FastAPI()
    app.state.limiter = RateLimiterService(pytest_settings.REDIS_DATABASE_URL)
    for callback in register().on_startup:
        await callback(app)
    app.add_middleware(RateLimitMiddleware)

    @app.post("/api/v1/auth/login")
    async def login():
        return {"code": 0}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            first = await client.post("/api/v1/auth/login", json={"username": "startup-policy"})
            second = await client.post("/api/v1/auth/login", json={"username": "startup-policy"})
        assert first.json()["code"] == 0
        assert second.json()["code"] == 1006
    finally:
        await app.state.limiter.close()


def access(user_id=None, *, expiry=timedelta(minutes=15)):
    return create_token(
        AccessJWT(sub=user_id or uuid4(), name="User", jti=uuid4()),
        expiry,
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )


def request(path="/auth/keys/public", *, method="GET", body=None, token=None, refresh=None, ip="203.0.113.8"):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else b""
    headers = [(b"content-type", b"application/json")]
    if token is not None:
        headers.append((b"authorization", token.encode()))
    if refresh is not None:
        headers.append((b"x-refresh-token", refresh.encode()))

    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": settings.API_PREFIX_V1 + path,
            "headers": headers,
            "query_string": b"",
            "client": (ip, 123) if ip else None,
            "scheme": "http",
            "server": ("test", 80),
        },
        receive,
    )


@pytest.mark.asyncio
async def test_identity_is_local_signature_only_and_impersonation_uses_subject(monkeypatch):
    monkeypatch.setattr(
        "rapidkit_core.database.RedisManager.client", lambda: pytest.fail("Identity must not read Redis")
    )
    user_id = uuid4()
    ordinary = await rate_limit_rules(request(token="Bearer " + access(user_id)))
    assert ordinary == [("default", f"user:{user_id}", "600/minute")]
    claims = ImpersonationJWT(
        token_type="impersonation", sub=user_id, act=uuid4(), sid=uuid4(), jti=uuid4(), exp=2000000000
    )
    token = create_impersonation_token(claims, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)
    assert await rate_limit_rules(request(token="Bearer " + token)) == ordinary


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["bad-signature", "expired", "no-bearer", "non-uuid", "algorithm", "missing-client", "oversized"]
)
async def test_bad_tokens_fall_back_to_ip(kind):
    token = "Bearer invalid"
    ip = "203.0.113.8"
    if kind == "expired":
        token = "Bearer " + access(expiry=timedelta(seconds=-1))
    elif kind == "no-bearer":
        token = access()
    elif kind in ("non-uuid", "algorithm"):
        algorithm = "HS512" if kind == "algorithm" else "HS256"
        payload = {
            "sub": str(uuid4()) if kind == "algorithm" else "invalid",
            "jti": str(uuid4()),
            "name": "User",
            "exp": 2000000000,
        }
        token = (
            "Bearer "
            + JsonWebToken([algorithm])
            .encode({"alg": algorithm}, payload, auth_settings.ACCESS_TOKEN_KEY.get_secret_value())
            .decode()
        )
    elif kind == "missing-client":
        ip = None
    elif kind == "oversized":
        token = "Bearer " + "x" * 300000
    rules = await rate_limit_rules(request(token=token, ip=ip))
    assert rules == [("default", "ip:" + (ip or "unknown"), "120/minute")]


@pytest.mark.asyncio
async def test_body_is_cached_and_composite_keys_preserve_account_semantics():
    first = request("/auth/login", method="POST", body={"username": "Alice"})
    rules = await rate_limit_rules(first)
    assert await first.json() == {"username": "Alice"}
    lower = await rate_limit_rules(request("/auth/login", method="POST", body={"username": "alice"}))
    assert rules[1][1] != lower[1][1]
    assert "Alice" not in rules[1][1]
    reset = await rate_limit_rules(
        request("/auth/password-reset/request", method="POST", body={"email": " User@Example.com "})
    )
    normalized = await rate_limit_rules(
        request("/auth/password-reset/request", method="POST", body={"email": "user@example.com"})
    )
    assert reset == normalized
    assert "example.com" not in reset[1][1]
    # Tuple encoding prevents ambiguous delimiter concatenation.
    a = await rate_limit_rules(request("/auth/login", method="POST", body={"username": "b:c"}, ip="a"))
    b = await rate_limit_rules(request("/auth/login", method="POST", body={"username": "c"}, ip="a:b"))
    assert a[1][1] != b[1][1]


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [b"{", b"[]", b"null", {}, {"username": ["bad"]}])
async def test_bad_body_still_has_ip_quota(body):
    rules = await rate_limit_rules(request("/auth/login", method="POST", body=body))
    assert rules[0][1] == "ip:203.0.113.8"
    assert ("login-ip", "ip:203.0.113.8", "200/minute") in rules


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,method,body,scope,threshold",
    [
        ("/auth/login", "POST", {"username": "test"}, "login-account", 10),
        ("/auth/password-reset/request", "POST", {"email": "test@example.com"}, "reset-account", 5),
        ("/auth/token/refresh", "POST", None, "refresh", 30),
        ("/auth/invite/validate", "GET", None, "credential-setup", 30),
        ("/auth/invite/set-password", "POST", None, "credential-setup", 30),
        ("/auth/password-reset/validate", "GET", None, "credential-setup", 30),
        ("/auth/password-reset/confirm", "POST", None, "credential-setup", 30),
    ],
)
async def test_sensitive_limits_stack_with_defaults(redis, monkeypatch, path, method, body, scope, threshold):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "10000/minute")
    service = RateLimiterService(pytest_settings.REDIS_DATABASE_URL)
    try:
        rules = await rate_limit_rules(request(path, method=method, body=body))
        assert any(rule[0] == scope and rule[2] == f"{threshold}/minute" for rule in rules)
        for _ in range(threshold):
            assert await service.check(rules) is None
        assert await service.check(rules) >= 1
        other = await rate_limit_rules(request(path, method=method, body=body, ip="203.0.113.9"))
        assert await service.check(other) is None
    finally:
        await service.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,threshold", [("login", 200), ("reset", 60)])
async def test_wide_ip_caps_and_distinct_accounts(redis, monkeypatch, kind, threshold):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "10000/minute")
    path = "/auth/login" if kind == "login" else "/auth/password-reset/request"
    field = "username" if kind == "login" else "email"
    service = RateLimiterService(pytest_settings.REDIS_DATABASE_URL)
    try:
        for index in range(threshold + 1):
            rules = await rate_limit_rules(request(path, method="POST", body={field: f"user{index}@example.com"}))
            result = await service.check(rules)
            assert (result is None) == (index < threshold)
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_refresh_uses_signed_sub_across_ips():
    user_id = uuid4()
    token = create_token(
        RefreshJWT(sub=user_id, jti=uuid4(), name="User", agent="test"),
        timedelta(days=7),
        auth_settings.REFRESH_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    first = await rate_limit_rules(request("/auth/token/refresh", method="POST", refresh=token))
    second = await rate_limit_rules(request("/auth/token/refresh", method="POST", refresh=token, ip="203.0.113.9"))
    assert first[-1] == second[-1] == ("refresh", f"user:{user_id}", "30/minute")


@pytest.mark.asyncio
async def test_http_limits_stack_and_include_retry_after(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "2/minute")
    for index in range(3):
        response = await client.post("/auth/login", json={"username": "bad", "password": "bad"})
        assert response.status_code == 200
        if index == 2:
            assert response.json()["code"] == 1006
            assert int(response.headers["Retry-After"]) >= 1
        else:
            assert response.json()["code"] != 1006


@pytest.mark.asyncio
async def test_swagger_and_json_login_share_account_bucket():
    normal = await rate_limit_rules(request("/auth/login", method="POST", body={"username": "Alice"}))
    form = request("/auth/login/swagger", method="POST", body=b"username=Alice&password=bad")
    form.scope["headers"] = [(b"content-type", b"application/x-www-form-urlencoded")]
    assert (await rate_limit_rules(form))[1:] == normal[1:]
    assert await form.body() == b"username=Alice&password=bad"


@pytest.mark.asyncio
async def test_internal_paths_never_increment_counters(redis):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from src.health import router
    from src.middlewares.limiter import RateLimitMiddleware

    app = FastAPI()
    app.include_router(router)
    app.add_middleware(RateLimitMiddleware)
    # Any access to the provider/limiter would fail before either route can respond.
    before = {key async for key in redis.scan_iter(match="LIMITS:*")}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as probes:
        assert (await probes.get("/health/live")).status_code == 200
        assert (await probes.get("/metrics")).status_code == 404
    assert {key async for key in redis.scan_iter(match="LIMITS:*")} == before


@pytest.mark.asyncio
async def test_http_default_limit_is_global_across_paths(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "2/minute")
    for path in ("/auth/keys/public", "/auth/password-reset/validate?token=missing"):
        assert (await client.get(path)).json()["code"] != 1006
    assert (await client.get("/auth/keys/public")).json()["code"] == 1006


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [b"{", b"[]", b"null", b"{}"])
async def test_invalid_json_retains_validation_response_and_is_counted(client, payload, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", "1/minute")
    response = await client.post("/auth/login", content=payload, headers={"Content-Type": "application/json"})
    assert response.json()["code"] == int(StatusCode.VALIDATION_ERROR)
    response = await client.get("/auth/keys/public")
    assert response.json()["code"] == 1006

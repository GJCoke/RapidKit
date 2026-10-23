"""Docs and exception details are opt-in on deployed environments.

Author : Codex
Date   : 2026-10-23
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from rapidkit_core.config import Config
from rapidkit_security import generate_rsa_key_pair, serialize_key

VALID_CONFIG = {
    "POSTGRESQL_ASYNC_SCHEME": "postgresql+asyncpg",
    "POSTGRESQL_SYNC_SCHEME": "postgresql+psycopg",
    "POSTGRESQL_USERNAME": "test",
    "POSTGRESQL_PASSWORD": "test",
    "POSTGRESQL_HOST": "localhost",
    "POSTGRESQL_DATABASE": "test",
    "REDIS_ROOT_PASSWORD": "",
    "REDIS_HOST": "localhost",
    "MINIO_ROOT_USER": "test",
    "MINIO_ROOT_PASSWORD": "test1234",
    "CORS_ORIGINS": '["https://frontend.example"]',
    "CORS_HEADERS": '["*"]',
}


@pytest.mark.parametrize(
    "environment,default", [("LOCAL", True), ("TESTING", True), ("STAGING", False), ("PRODUCTION", False)]
)
@pytest.mark.parametrize("override", [None, True, False])
def test_disclosure_defaults_and_explicit_overrides(environment, default, override, monkeypatch):
    for name, value in VALID_CONFIG.items():
        monkeypatch.setenv(name, value)
    for name in ("EXPOSE_API_DOCS", "EXPOSE_ERROR_DETAILS"):
        monkeypatch.delenv(name, raising=False)
    explicit = {} if override is None else {"EXPOSE_API_DOCS": override, "EXPOSE_ERROR_DETAILS": not override}
    config = Config(_env_file=None, ENVIRONMENT=environment, **explicit)
    assert config.EXPOSE_API_DOCS is (default if override is None else override)
    assert config.EXPOSE_ERROR_DETAILS is (default if override is None else not override)
    assert config.ENVIRONMENT.is_debug is (environment != "PRODUCTION")


CHILD = r"""
import asyncio
import os
from unittest.mock import patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from rapidkit_core.config import settings
from rapidkit_framework.exceptions import AppException
from rapidkit_framework.status_codes import StatusCode
from src.sio.identity import IdentityAwareAsyncServer

async def verify():
    with patch.object(IdentityAwareAsyncServer, "instrument") as instrument:
        # Import inside a running loop, as required by Socket.IO admin tasks.
        from src.main import app, setup_exception_handlers
        from src.sio.app import socket
        from rapidkit_common.deps import check_api_docs, check_debug

        exposed = os.environ["EXPECTED_EXPOSED"] == "true"
        paths = {route.path for route in app.routes if hasattr(route, "path")}
        for path in ("/docs", "/redoc", "/openapi.json", "/sio/docs"):
            assert (path in paths) is exposed, (path, paths)
        assert instrument.called is exposed
        assert ("https://admin.socket.io" in socket.eio.cors_allowed_origins) is exposed
        swagger = next(route for route in app.routes if getattr(route, "path", "").endswith("/auth/login/swagger"))
        assert check_api_docs in [dep.call for dep in swagger.dependant.dependencies]
        try:
            check_api_docs()
        except AppException as exc:
            assert not exposed and exc.code == int(StatusCode.INVALID_OPERATION)
        else:
            assert exposed
        if settings.ENVIRONMENT.value == "STAGING":
            assert settings.ENVIRONMENT.is_debug
            check_debug()

        isolated = FastAPI()
        setup_exception_handlers(isolated)
        @isolated.get("/failure")
        async def failure():
            raise ValueError("internal database detail")
        async with AsyncClient(
            transport=ASGITransport(app=isolated, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            response = await client.get("/failure")
        assert response.status_code == 200
        assert response.json()["code"] == int(StatusCode.INTERNAL_SERVER_ERROR)
        details = os.environ["EXPECTED_DETAILS"] == "true"
        assert response.json()["data"] == ("internal database detail" if details else None)
        await app.state.limiter.close()

asyncio.run(verify())
"""


@pytest.fixture(scope="module")
def test_keys():
    private, public = generate_rsa_key_pair()
    return {"RSA_PRIVATE_KEY": serialize_key(private).decode(), "RSA_PUBLIC_KEY": serialize_key(public).decode()}


@pytest.mark.parametrize(
    "environment,override,expected,details",
    [
        ("LOCAL", None, True, None),
        ("TESTING", None, True, None),
        ("STAGING", None, False, None),
        ("PRODUCTION", None, False, None),
        ("STAGING", "true", True, None),
        ("TESTING", "false", False, None),
        ("STAGING", "true", True, False),
        ("STAGING", "false", False, True),
    ],
)
def test_environment_hides_all_debug_surfaces(environment, override, expected, details, test_keys, tmp_path):
    env = {
        "PATH": os.defpath,
        "PYTHONPATH": str(Path(__file__).resolve().parents[1]),
        **VALID_CONFIG,
        **test_keys,
        "ENVIRONMENT": environment,
        "ACCESS_TOKEN_KEY": "exposure-test-access",
        "REFRESH_TOKEN_KEY": "exposure-test-refresh",
        "IMPERSONATION_TOKEN_KEY": "exposure-test-impersonation",
        "ENABLE_CELERY_MONITOR": "false",
        "EXPECTED_EXPOSED": str(expected).lower(),
        "EXPECTED_DETAILS": str(expected if details is None else details).lower(),
    }
    if override is not None:
        env.update(EXPOSE_API_DOCS=override, EXPOSE_ERROR_DETAILS=override)
    if details is not None:
        env["EXPOSE_ERROR_DETAILS"] = str(details).lower()
    result = subprocess.run(
        [sys.executable, "-c", CHILD], cwd=tmp_path, env=env, capture_output=True, text=True, timeout=30
    )
    assert result.returncode == 0, result.stdout + result.stderr

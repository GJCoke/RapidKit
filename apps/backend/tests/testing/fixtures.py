"""
Shared pytest fixtures for RapidKit backend integration tests.

Provides:
- Service availability probes (Postgres, Redis) with auto-skip/fail
- Async DB session (Postgres via asyncpg)
- Redis client
- Seeded database via initdb
- Full-app httpx AsyncClient with auth bypass
- Authenticated request headers helper

Usage in any conftest.py:
    from tests.testing.fixtures import *  # noqa: F401, F403
"""

import socket
from typing import Any, AsyncIterator, cast

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import ConnectionPool, Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


class PytestSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.pytest", env_file_encoding="utf-8", extra="ignore")

    SQL_DATABASE_URL: str = "postgresql+asyncpg://test:test@localhost:5432/test"
    REDIS_DATABASE_URL: str = "redis://localhost:6379"
    ENVIRONMENT: str = ""


pytest_settings = PytestSettings()


# ---------------------------------------------------------------------------
# Service availability probes
# ---------------------------------------------------------------------------


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
    """Try a TCP connect to check if a service is listening."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _parse_host_port(url: str, default_port: int) -> tuple[str, int]:
    """Extract host and port from a database URL."""
    # postgresql+asyncpg://user:pass@host:port/db  or  redis://host:port
    from urllib.parse import urlparse

    parsed = urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or default_port
    return host, port


_pg_host, _pg_port = _parse_host_port(pytest_settings.SQL_DATABASE_URL, 5432)
_redis_host, _redis_port = _parse_host_port(pytest_settings.REDIS_DATABASE_URL, 6379)

_is_ci = pytest_settings.ENVIRONMENT == "TESTING"
_pg_available = _tcp_reachable(_pg_host, _pg_port)
_redis_available = _tcp_reachable(_redis_host, _redis_port)


# ---------------------------------------------------------------------------
# Availability fixtures (session-scoped)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def require_postgres():
    """Skip or fail if Postgres is unreachable."""
    if not _pg_available:
        if _is_ci:
            pytest.fail("Postgres required in CI but not reachable")
        pytest.skip("Postgres not available")


@pytest.fixture(scope="session")
def require_redis():
    """Skip or fail if Redis is unreachable."""
    if not _redis_available:
        if _is_ci:
            pytest.fail("Redis required in CI but not reachable")
        pytest.skip("Redis not available")


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def pg_engine(require_postgres):
    """Create an async engine for the test Postgres database."""
    engine = create_async_engine(
        pytest_settings.SQL_DATABASE_URL,
        echo=False,
    )
    return engine


@pytest_asyncio.fixture
async def session(pg_engine) -> AsyncIterator[AsyncSession]:
    """Provide an async DB session with tables created."""
    async with pg_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    _async_session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with _async_session() as sess:
        yield sess

    # Clean up: drop all tables after each test to ensure isolation
    async with pg_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


# ---------------------------------------------------------------------------
# Redis fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def redis(require_redis) -> AsyncIterator[Redis]:
    """Provide an async Redis client. Auto-flushes the test DB after each test."""
    pool = ConnectionPool.from_url(
        pytest_settings.REDIS_DATABASE_URL,
        max_connections=10,
        decode_responses=True,
    )
    client = Redis(connection_pool=pool)

    yield client

    await client.flushdb()
    await pool.disconnect()


# ---------------------------------------------------------------------------
# App fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def init(session: AsyncSession) -> None:
    """Seed the database with initial test data (admin user, roles, menus)."""
    from src.initdb import init_db

    await init_db(session)


@pytest_asyncio.fixture
async def client(
    require_postgres,
    require_redis,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    """Full-app httpx client with auth bypass and service URL overrides."""
    from plugin_auth.role.deps import verify_user_permission
    from plugin_auth.router import sync
    from rapidkit_core import database
    from rapidkit_core.config import settings
    from src.main import app

    monkeypatch.setattr(database, "ASYNC_DATABASE_URL", pytest_settings.SQL_DATABASE_URL)
    monkeypatch.setattr(database, "REDIS_URL", pytest_settings.REDIS_DATABASE_URL)

    async def async_none(*_args: Any, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(sync, "store_router_in_db", async_none)
    app.dependency_overrides[verify_user_permission] = lambda: None

    async with LifespanManager(app) as manager:
        transport = ASGITransport(app=manager.app)
        async with AsyncClient(transport=transport, base_url=f"https://{settings.API_PREFIX_V1}") as c:
            yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """Login as admin and return Authorization headers for authenticated requests."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
    from rapidkit_core.security import encrypt_message, load_public_pem
    from src.initdb import PASSWORD, USERNAME

    # Get RSA public key
    resp = await client.get("/auth/keys/public")
    assert resp.status_code == 200
    pem = resp.json()["data"]
    public_key = cast(RSAPublicKey, load_public_pem(pem))

    # Login
    resp = await client.post(
        "/auth/login",
        json={"username": USERNAME, "password": encrypt_message(public_key, PASSWORD)},
    )
    assert resp.status_code == 200
    assert resp.json()["code"] == 0
    token = resp.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}"}

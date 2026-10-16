from datetime import UTC, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
import pytest_asyncio
from plugin_auth.auth.deps import get_current_user_form_db
from plugin_auth.auth.resolver import AuthContextResolverImpl, force_relogin_structure, user_structure
from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.cache import active_key
from plugin_auth.impersonation.models import EndReason, ImpersonationSession
from plugin_auth.impersonation.service import ImpersonationService
from plugin_auth.providers import CurrentUserProviderImpl, TokenDecoderImpl
from plugin_system.impersonation_audit import ImpersonationAuditWriterImpl
from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_framework.exceptions import AppException
from rapidkit_security import AccessJWT, ImpersonationJWT, create_impersonation_token, create_token
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture
async def setup_resolver(session, pg_engine, redis):
    actor = User(name="Admin", username="actor", email="a@example.com", password=b"test", is_admin=True)
    subject = User(name="User", username="subject", email="s@example.com", password=b"test")
    session.add_all([actor, subject])
    await session.commit()
    factory = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    service = ImpersonationService(factory, redis, ImpersonationAuditWriterImpl(), AsyncMock())
    record = await service.start(actor.id, subject.id, reason=None, ip=None, user_agent=None)
    claims = ImpersonationJWT(
        token_type="impersonation",
        act=actor.id,
        sub=subject.id,
        sid=record.id,
        jti=uuid4(),
        exp=int(record.expires_at.replace(tzinfo=UTC).timestamp()),
    )
    return AuthContextResolverImpl(factory, redis, service), actor, subject, record, claims


def token(claims):
    return create_impersonation_token(claims, auth_settings.IMPERSONATION_TOKEN_KEY, auth_settings.JWT_ALG)


@pytest.mark.asyncio
@pytest.mark.parametrize("cache", [True, False])
async def test_consistency(setup_resolver, redis, cache):
    resolver, actor, subject, record, claims = setup_resolver
    if not cache:
        await redis.delete(active_key(record.id))
    auth = await resolver.resolve(token(claims))
    assert auth.actor.id == actor.id and auth.subject.id == subject.id and not auth.subject.is_admin
    assert (await CurrentUserProviderImpl(resolver).get_current_user(token(claims))).id == subject.id
    assert await TokenDecoderImpl(resolver).decode_user_id(token(claims)) == subject.id
    assert await redis.get(active_key(record.id))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "who,field,value,reason",
    [
        (0, "status", Status.OFF, "actor_revoked"),
        (0, "is_admin", False, "actor_revoked"),
        (1, "status", Status.OFF, "subject_revoked"),
        (1, "is_admin", True, "subject_revoked"),
    ],
)
async def test_authoritative_revocation(setup_resolver, session, redis, who, field, value, reason):
    resolver, actor, subject, record, claims = setup_resolver
    user = [actor, subject][who]
    await redis.set(user_structure.format(user_id=user.id), user.model_dump_json())
    setattr(user, field, value)
    session.add(user)
    await session.commit()
    request = SimpleNamespace(state=SimpleNamespace())
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims), request)
    assert exc.value.code == 14017 and request.state.auth.actor_id == actor.id
    assert (await session.get(ImpersonationSession, record.id)).end_reason == reason


@pytest.mark.asyncio
@pytest.mark.parametrize("who", [0, 1])
async def test_force_relogin(setup_resolver, redis, who):
    resolver, actor, subject, _, claims = setup_resolver
    await redis.set(force_relogin_structure.format(user_id=[actor, subject][who].id), "1")
    assert await CurrentUserProviderImpl(resolver).get_current_user(token(claims)) is None
    assert await TokenDecoderImpl(resolver).decode_user_id(token(claims)) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["act", "sub", "sid", "exp"])
async def test_binding(setup_resolver, field):
    resolver, _, _, _, claims = setup_resolver
    claims = claims.model_copy(update={field: claims.exp + 1 if field == "exp" else uuid4()})
    request = SimpleNamespace(state=SimpleNamespace())
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims), request)
    assert exc.value.code == 14017 and request.state.auth.impersonation_session_id == claims.sid


@pytest.mark.asyncio
async def test_stale_marker(setup_resolver, redis):
    resolver, _, _, record, claims = setup_resolver
    marker = await redis.get(active_key(record.id))
    await resolver.impersonations.end(record.id, EndReason.STOPPED)
    await redis.set(active_key(record.id), marker)
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims))
    assert exc.value.code == 14017


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["db", "redis", "both", "json"])
async def test_faults(setup_resolver, redis, fault):
    resolver, _, _, record, claims = setup_resolver
    if fault in ("db", "both"):
        resolver.session_factory = Mock(side_effect=RuntimeError("offline"))
    if fault in ("redis", "both"):
        resolver._redis = AsyncMock()
        resolver._redis.get.side_effect = RuntimeError("offline")
        resolver._redis.exists.side_effect = RuntimeError("offline")
    if fault == "json":
        await redis.set(active_key(record.id), "bad-json")
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims))
    assert exc.value.code == 14017


@pytest.mark.asyncio
async def test_activity(setup_resolver, monkeypatch):
    resolver, _, subject, _, claims = setup_resolver
    observed = Mock()
    monkeypatch.setattr("plugin_auth.auth.deps.event_bus.fire_and_forget", observed)
    await get_current_user_form_db(await resolver.resolve(token(claims)))
    observed.assert_not_called()
    ordinary = create_token(
        AccessJWT(sub=subject.id, name=subject.name, jti=uuid4()),
        timedelta(minutes=5),
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    await get_current_user_form_db(await resolver.resolve(ordinary))
    observed.assert_called_once()


def test_registration_is_lazy(monkeypatch):
    from plugin_auth import register
    from rapidkit_common.protocols.auth import AuthContextResolver, TokenDecoder
    from rapidkit_common.protocols.user import UserResolver
    from rapidkit_core.database import RedisManager
    from rapidkit_framework.services import ServiceRegistry

    monkeypatch.setattr(RedisManager, "client", Mock(side_effect=RuntimeError("not connected")))
    registry = ServiceRegistry()
    registry.register(UserResolver, Mock())
    register().service_factories[TokenDecoder](registry)
    assert registry.get(AuthContextResolver)
    RedisManager.client.assert_not_called()


@pytest.mark.asyncio
async def test_expired_ends_best_effort(setup_resolver, session):
    resolver, _, _, record, claims = setup_resolver
    record.expires_at -= timedelta(hours=2)
    session.add(record)
    await session.commit()
    claims = claims.model_copy(update={"exp": int(record.expires_at.replace(tzinfo=UTC).timestamp())})
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims))
    assert exc.value.code == 14017
    await session.refresh(record)
    assert record.end_reason == "expired"


@pytest.mark.asyncio
async def test_cache_read_failure_falls_back(setup_resolver):
    resolver, _, subject, _, claims = setup_resolver
    concrete = resolver.redis
    resolver._redis = Mock()
    resolver._redis.get = AsyncMock(side_effect=RuntimeError("read failed"))
    resolver._redis.exists = concrete.exists
    resolver._redis.set = concrete.set
    resolver._redis.sadd = concrete.sadd
    assert (await resolver.resolve(token(claims))).subject.id == subject.id


@pytest.mark.asyncio
async def test_http_dependency_uses_subject_without_activity(setup_resolver, monkeypatch):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from plugin_auth.auth.deps import UserDBDep

    resolver, _, subject, _, claims = setup_resolver
    app = FastAPI()
    from starlette_context.middleware import RawContextMiddleware

    app.add_middleware(RawContextMiddleware)
    monkeypatch.setattr("plugin_auth.auth.deps.get_service", lambda _: resolver)
    observed = Mock()
    monkeypatch.setattr("plugin_auth.auth.deps.event_bus.fire_and_forget", observed)

    @app.get("/identity")
    async def identity(user: UserDBDep):
        return {"id": str(user.id), "admin": user.is_admin}

    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/identity", headers={"Authorization": f"Bearer {token(claims)}"})
    assert response.status_code == 200
    assert response.json() == {"id": str(subject.id), "admin": False}
    observed.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [Status.OFF, Status.PENDING])
async def test_ordinary_status_is_not_reinterpreted(setup_resolver, session, status):
    resolver, _, subject, _, _ = setup_resolver
    subject.status = status
    session.add(subject)
    await session.commit()
    ordinary = create_token(
        AccessJWT(sub=subject.id, name=subject.name, jti=uuid4()),
        timedelta(minutes=5),
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    with pytest.raises(AppException) as exc:
        await resolver.resolve(ordinary)
    from plugin_auth.status_codes import AuthStatusCode

    expected = AuthStatusCode.USER_DISABLED if status == Status.OFF else AuthStatusCode.ACCOUNT_NOT_ACTIVATED
    assert exc.value.code == expected.code


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["actor_id", "subject_user_id", "expires_at"])
async def test_cache_binding_cannot_override_database(setup_resolver, redis, field):
    import json

    resolver, _, _, record, claims = setup_resolver
    binding = json.loads(await redis.get(active_key(record.id)))
    binding[field] = claims.exp + 1 if field == "expires_at" else str(uuid4())
    await redis.set(active_key(record.id), json.dumps(binding))
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims))
    assert exc.value.code == 14017


@pytest.mark.asyncio
async def test_rejection_does_not_depend_on_end_success(setup_resolver, redis):
    resolver, actor, _, _, claims = setup_resolver
    resolver.impersonations = AsyncMock()
    resolver.impersonations.end.side_effect = RuntimeError("audit unavailable")
    await redis.set(force_relogin_structure.format(user_id=actor.id), "1")
    with pytest.raises(AppException) as exc:
        await resolver.resolve(token(claims))
    assert exc.value.code == 14017


@pytest.mark.asyncio
async def test_unverified_claims_are_not_published(setup_resolver):
    resolver, _, _, _, _ = setup_resolver
    request = SimpleNamespace(state=SimpleNamespace())
    with pytest.raises(AppException) as exc:
        await resolver.resolve("unverified-token", request)
    assert exc.value.code == 14003
    assert not hasattr(request.state, "auth")

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from plugin_auth.auth.resolver import AuthContextResolverImpl, user_structure
from plugin_auth.auth.schemas import UserInfoResponse
from plugin_auth.auth.token_store import REVOKED_BEFORE_KEY
from plugin_auth.auth_config import auth_settings
from plugin_auth.impersonation.cache import active_key
from plugin_auth.impersonation.models import ImpersonationSession
from plugin_auth.status_codes import AuthStatusCode
from plugin_department.providers import collect_subtree_ids
from plugin_user.models import User
from rapidkit_common.enums import Status
from rapidkit_core.timezone import timezone
from rapidkit_framework.exceptions import AppException
from rapidkit_security import AccessJWT, ImpersonationJWT, create_impersonation_token, create_token

CACHE_FIELDS = {
    "id",
    "name",
    "email",
    "username",
    "status",
    "is_admin",
    "roles",
    "department_id",
    "create_time",
    "update_time",
}


@pytest.mark.asyncio
@pytest.mark.parametrize("has_department", [True, False])
async def test_cached_normal_user_preserves_uuid_identity_and_department_subtree(has_department):
    department_id, child_id = uuid4(), uuid4()
    user = User(
        name="Cached User",
        username="cached-user",
        email="cached@example.com",
        password=b"test",
        department_id=department_id if has_department else None,
    )
    key = user_structure.format(user_id=user.id)
    redis = AsyncMock()
    redis.mget.return_value = [None, None, None]
    redis.get.side_effect = lambda lookup: user.model_dump_json(include=CACHE_FIELDS) if lookup == key else None
    resolver = AuthContextResolverImpl(Mock(side_effect=AssertionError("cache hit must not query DB")), redis, None)
    token = create_token(
        AccessJWT(sub=user.id, name=user.name, jti=uuid4()),
        timedelta(minutes=5),
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )

    auth = await resolver.resolve(token)

    assert auth.subject.department_id == (department_id if has_department else None)
    assert auth.subject.id == user.id
    assert auth.actor is auth.subject
    if has_department:
        assert collect_subtree_ids(
            [(department_id, None), (child_id, department_id)],
            auth.subject.department_id,
        ) == [department_id, child_id]


@pytest.fixture
def authentication_case():
    subject = User(
        id=uuid4(),
        name="Subject User",
        username="subject-user",
        email="subject@example.com",
        password=b"secret",
        department_id=uuid4(),
        roles=["editor"],
        create_time=datetime(2026, 10, 1, 8),
        update_time=datetime(2026, 10, 2, 9),
    )
    actor = User(
        id=uuid4(),
        name="Admin User",
        username="admin-user",
        email="admin@example.com",
        password=b"admin-secret",
        is_admin=True,
    )
    now = timezone.now()
    record = ImpersonationSession(
        actor_id=actor.id,
        subject_user_id=subject.id,
        created_at=now,
        expires_at=now + timedelta(hours=1),
    )
    records = {(User, subject.id): subject, (User, actor.id): actor, (ImpersonationSession, record.id): record}
    session = AsyncMock()
    session.__aenter__.return_value = session
    session.get.side_effect = lambda model, identity: records.get((model, identity))
    cached = {
        active_key(record.id): json.dumps(
            {
                "actor_id": str(actor.id),
                "subject_user_id": str(subject.id),
                "expires_at": int(record.expires_at.replace(tzinfo=UTC).timestamp()),
            }
        ),
    }
    redis = AsyncMock()
    redis.get.side_effect = cached.get
    redis.mget.side_effect = lambda keys: [cached.get(key) for key in keys]
    redis.set.side_effect = lambda key, value, **kwargs: cached.__setitem__(key, value)
    resolver = AuthContextResolverImpl(Mock(return_value=session), redis, AsyncMock())
    ordinary = create_token(
        AccessJWT(sub=subject.id, name=subject.name, jti=uuid4()),
        timedelta(minutes=5),
        auth_settings.ACCESS_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    impersonated = create_impersonation_token(
        ImpersonationJWT(
            token_type="impersonation",
            sub=subject.id,
            act=actor.id,
            sid=record.id,
            jti=uuid4(),
            exp=int(record.expires_at.replace(tzinfo=UTC).timestamp()),
        ),
        auth_settings.IMPERSONATION_TOKEN_KEY,
        auth_settings.JWT_ALG,
    )
    return SimpleNamespace(
        subject=subject,
        actor=actor,
        record=record,
        cached=cached,
        resolver=resolver,
        ordinary=ordinary,
        impersonated=impersonated,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("has_department", [True, False])
@pytest.mark.parametrize("source", ["database", "cache", "fresh", "impersonation"])
async def test_cache_database_and_impersonation_return_same_typed_user(authentication_case, has_department, source):
    case = authentication_case
    if not has_department:
        case.subject.department_id = None
    database = await case.resolver.resolve(case.ordinary)
    cached = await case.resolver.resolve(case.ordinary)
    fresh = await case.resolver.resolve(case.ordinary, fresh=True)
    impersonated = await case.resolver.resolve(case.impersonated)

    auth = {"database": database, "cache": cached, "fresh": fresh, "impersonation": impersonated}[source]
    assert auth.subject.id == case.subject.id
    assert auth.subject.department_id == case.subject.department_id
    assert type(auth.subject.status) is Status
    assert type(auth.subject.create_time) is datetime
    assert type(auth.subject.update_time) is datetime
    assert not hasattr(auth.subject, "password")
    assert not hasattr(auth.actor, "password")
    assert "_sa_instance_state" not in vars(auth.subject)
    assert auth.subject.model_dump() == database.subject.model_dump()
    assert type(auth.subject) is type(database.subject) is type(auth.actor)
    assert UserInfoResponse.model_validate(auth.subject).model_dump_json() == (
        UserInfoResponse.model_validate(case.subject).model_dump_json()
    )
    raw = json.loads(case.cached[user_structure.format(user_id=case.subject.id)])
    assert set(raw) == CACHE_FIELDS
    assert "password" not in raw
    assert database.actor is database.subject
    assert impersonated.actor.id == case.actor.id


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [Status.OFF, Status.PENDING])
@pytest.mark.parametrize("source", ["database", "cache", "fresh", "impersonation"])
async def test_typed_authentication_preserves_account_rejections(authentication_case, status, source):
    case = authentication_case
    case.subject.status = status
    if source == "cache":
        case.cached[user_structure.format(user_id=case.subject.id)] = case.subject.model_dump_json(include=CACHE_FIELDS)
    expected = AuthStatusCode.USER_DISABLED if status == Status.OFF else AuthStatusCode.ACCOUNT_NOT_ACTIVATED
    if source == "impersonation":
        expected = AuthStatusCode.IMPERSONATION_SESSION_INVALID
    with pytest.raises(AppException) as exc:
        await case.resolver.resolve(
            case.impersonated if source == "impersonation" else case.ordinary,
            fresh=source == "fresh",
        )
    assert exc.value.code == expected.code


@pytest.mark.asyncio
async def test_fresh_authentication_bypasses_stale_cached_profile(authentication_case):
    case = authentication_case
    await case.resolver.resolve(case.ordinary)
    case.subject.name = "Updated User"

    assert (await case.resolver.resolve(case.ordinary)).subject.name == "Subject User"
    assert (await case.resolver.resolve(case.ordinary, fresh=True)).subject.name == "Updated User"
    assert (await case.resolver.resolve(case.impersonated)).subject.name == "Updated User"


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["actor-disabled", "actor-demoted", "subject-admin", "ended", "token-revoked"])
async def test_typed_impersonation_keeps_database_and_revocation_authoritative(authentication_case, revocation):
    case = authentication_case
    await case.resolver.resolve(case.ordinary)
    if revocation == "actor-disabled":
        case.actor.status = Status.OFF
    elif revocation == "actor-demoted":
        case.actor.is_admin = False
    elif revocation == "subject-admin":
        case.subject.is_admin = True
    elif revocation == "ended":
        case.record.ended_at = timezone.now()
    else:
        case.cached[REVOKED_BEFORE_KEY.format(user_id=case.actor.id)] = str(
            int((timezone.now() + timedelta(seconds=1)).replace(tzinfo=UTC).timestamp() * 1000)
        )

    with pytest.raises(AppException) as exc:
        await case.resolver.resolve(case.impersonated)
    assert exc.value.code == AuthStatusCode.IMPERSONATION_SESSION_INVALID.code

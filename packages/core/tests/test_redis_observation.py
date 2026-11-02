import inspect
import io
import json
import socket
from uuid import uuid4

import pytest
import pytest_asyncio
from rapidkit_core import dependency_observation, log, runtime_state
from rapidkit_core.config import settings
from rapidkit_core.redis_client import AsyncRedisClient, RedisClient, _operation
from redis import Redis
from redis.backoff import NoBackoff
from redis.exceptions import ConnectionError, NoPermissionError, ResponseError
from redis.retry import Retry


@pytest.mark.parametrize(
    "command,expected",
    [
        ("XGROUP CREATE", "stream"),
        ("XGROUP CREATECONSUMER", "stream"),
        (b"XINFO GROUPS", "stream"),
        (b"SCRIPT LOAD", "script"),
        ("XREADGROUP", "wait"),
        (b"GET", "get"),
        ("UNKNOWN", "other"),
    ],
)
def test_compound_commands_have_a_finite_operation_category(command, expected):
    assert _operation(command) == expected


async def invoke(client, method, *args, **kwargs):
    result = getattr(client, method)(*args, **kwargs)
    return await result if inspect.isawaitable(result) else result


@pytest_asyncio.fixture(params=[RedisClient, AsyncRedisClient], ids=["sync", "async"])
async def observed(request, monkeypatch):
    rows = []
    monkeypatch.setattr(dependency_observation, "_notices", {})
    monkeypatch.setattr(dependency_observation, "NOTICE_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(runtime_state, "_dependencies", {})
    monkeypatch.setattr(settings, "DEPENDENCY_SLOW_THRESHOLD_MS", 60_000)
    monkeypatch.setattr(log.sys, "stdout", io.StringIO())
    log.setup_logging()
    handler = log.logger.add(lambda message: rows.append(json.loads(message.record["extra"]["_json"])))
    client = request.param.from_url(str(settings.REDIS_URL), decode_responses=True)
    yield client, rows
    await invoke(client, "aclose" if isinstance(client, AsyncRedisClient) else "close")
    log.logger.remove(handler)
    for owned in log._owned_handlers:
        log.logger.remove(owned)
    log._owned_handlers.clear()


async def test_existing_group_is_expected_but_original_response_error_still_reaches_caller(observed):
    client, rows = observed
    key = "synthetic-stream-" + uuid4().hex
    try:
        assert await invoke(client, "xgroup_create", key, "group", id="0", mkstream=True)
        with pytest.raises(ResponseError, match="^BUSYGROUP"):
            await invoke(client, "xgroup_create", key, "group", id="0", mkstream=True)
        with pytest.raises(ResponseError, match="^BUSYGROUP"):
            await invoke(client, "execute_command", b"XGROUP CREATE", key, "group", "0", "MKSTREAM")
        assert not rows
        assert runtime_state._dependencies[("redis", "stream", "success")][-2] == 3
        assert ("redis", "stream", "error") not in runtime_state._dependencies
        assert len(await invoke(client, "xinfo_groups", key)) == 1
    finally:
        await invoke(client, "delete", key)


async def test_wrong_type_response_is_still_a_real_failure(observed):
    client, rows = observed
    key = "synthetic-private-key-" + uuid4().hex
    try:
        await invoke(client, "set", key, "synthetic-private-value")
        with pytest.raises(ResponseError, match="^WRONGTYPE"):
            await invoke(client, "xgroup_create", key, "group", mkstream=True)
        assert len(rows) == 1
        assert (rows[0]["event"], rows[0]["operation"], rows[0]["exception_type"]) == (
            "dependency.failed",
            "stream",
            "ResponseError",
        )
        assert "synthetic-private" not in json.dumps(rows)
    finally:
        await invoke(client, "delete", key)


async def test_permission_denial_is_still_a_real_failure(observed):
    client, rows = observed
    admin = Redis.from_url(str(settings.REDIS_URL), decode_responses=True)
    username = "synthetic-observer-" + uuid4().hex
    password = "synthetic-only-password"
    try:
        admin.acl_setuser(username, enabled=True, passwords=["+" + password], categories=["+connection"], keys=["*"])
        restricted = type(client).from_url(str(settings.REDIS_URL), username=username, password=password)
        try:
            with pytest.raises(NoPermissionError):
                await invoke(restricted, "xgroup_create", "synthetic-private-stream", "group", mkstream=True)
            assert len(rows) == 1
            assert rows[0]["operation"] == "stream" and rows[0]["exception_type"] == "NoPermissionError"
            assert "synthetic-private" not in json.dumps(rows) and password not in json.dumps(rows)
        finally:
            await invoke(restricted, "aclose" if isinstance(restricted, AsyncRedisClient) else "close")
    finally:
        admin.acl_deluser(username)
        admin.close()


async def test_connection_failure_is_not_suppressed(observed):
    client, rows = observed
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    unavailable = type(client)(host="127.0.0.1", port=port, retry=Retry(NoBackoff(), 0), socket_connect_timeout=0.1)
    try:
        with pytest.raises(ConnectionError):
            await invoke(unavailable, "xgroup_create", "synthetic-stream", "group", mkstream=True)
        assert len(rows) == 1 and rows[0]["operation"] == "stream"
        assert rows[0]["exception_type"] == "ConnectionError" and rows[0]["retryable"] is True
    finally:
        await invoke(unavailable, "aclose" if isinstance(unavailable, AsyncRedisClient) else "close")

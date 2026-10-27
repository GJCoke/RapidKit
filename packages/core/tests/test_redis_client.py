"""Redis model reads validate field types without requiring a Redis server."""

import json
from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
import pytest_asyncio
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from pydantic import Field as PydanticField
from rapidkit_core.redis_client import AsyncRedisClient
from redis.asyncio import Redis
from sqlalchemy import MetaData
from sqlmodel import Field, SQLModel


class State(StrEnum):
    ACTIVE = "active"


class CacheRecord(SQLModel, table=True):
    __tablename__ = "redis_client_test_records"
    metadata: ClassVar[MetaData] = MetaData()

    id: UUID = Field(primary_key=True)
    department_id: UUID | None
    created_at: datetime
    state: State
    name: str

    def __hash__(self):
        return hash(self.id)


class CacheSchema(BaseModel):
    id: UUID
    department_id: UUID | None
    created_at: datetime
    state: State
    name: str = PydanticField(alias="displayName")
    version: int = PydanticField(default=1, strict=True)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        return value.strip()

    def __hash__(self):
        return hash(self.id)


class StrictSchema(BaseModel):
    model_config = ConfigDict(strict=True, frozen=True)

    id: UUID
    created_at: datetime


PAYLOAD = {
    "id": "00000000-0000-7000-8000-000000000001",
    "department_id": "00000000-0000-7000-8000-000000000002",
    "created_at": "2026-10-27T08:30:00",
    "state": "active",
    "name": "User",
}
READERS = ["get", "hget", "lrange", "smembers"]


@pytest_asyncio.fixture
async def client():
    redis = AsyncRedisClient()
    yield redis
    await redis.aclose()


async def read(client, reader, **kwargs):
    args = {"get": ("key",), "hget": ("key", "field"), "lrange": ("key", 0, -1), "smembers": ("key",)}
    return await getattr(client, reader)(*args[reader], **kwargs)


def stub_reply(monkeypatch, reader, payload):
    raw = json.dumps(payload).encode()
    reply = [raw] if reader == "lrange" else {raw} if reader == "smembers" else raw
    monkeypatch.setattr(Redis, reader, AsyncMock(return_value=reply))
    return reply


@pytest.mark.asyncio
@pytest.mark.parametrize("reader", READERS)
@pytest.mark.parametrize("model", [CacheRecord, CacheSchema])
@pytest.mark.parametrize("department_id", [PAYLOAD["department_id"], None])
async def test_read_restores_uuid_datetime_and_enum(client, monkeypatch, reader, model, department_id):
    payload = {**PAYLOAD, "department_id": department_id}
    if model is CacheSchema:
        payload["displayName"] = " User "
        del payload["name"]
    stub_reply(monkeypatch, reader, payload)

    result = await read(client, reader, response_model=model)
    record = next(iter(result)) if reader in {"lrange", "smembers"} else result

    assert record.id == UUID("00000000-0000-7000-8000-000000000001")
    assert record.department_id == (UUID("00000000-0000-7000-8000-000000000002") if department_id else None)
    assert record.created_at == datetime(2026, 10, 27, 8, 30)
    assert record.state is State.ACTIVE
    assert record.name == "User"


@pytest.mark.asyncio
@pytest.mark.parametrize("reader", READERS)
async def test_read_rejects_incomplete_table_model(client, monkeypatch, reader):
    payload = {key: value for key, value in PAYLOAD.items() if key != "name"}
    stub_reply(monkeypatch, reader, payload)

    with pytest.raises(ValidationError) as exc:
        await read(client, reader, response_model=CacheRecord)
    assert any(error["loc"] == ("name",) and error["type"] == "missing" for error in exc.value.errors())


@pytest.mark.asyncio
@pytest.mark.parametrize("reader", READERS)
async def test_read_preserves_strict_schema_validation(client, monkeypatch, reader):
    stub_reply(monkeypatch, reader, {**PAYLOAD, "displayName": "User", "version": "1"})

    with pytest.raises(ValidationError) as exc:
        await read(client, reader, response_model=CacheSchema)
    assert any(error["loc"] == ("version",) and error["type"] == "int_type" for error in exc.value.errors())


@pytest.mark.asyncio
@pytest.mark.parametrize("reader", READERS)
async def test_read_preserves_strict_json_uuid_and_datetime(client, monkeypatch, reader):
    stub_reply(monkeypatch, reader, PAYLOAD)

    result = await read(client, reader, response_model=StrictSchema)
    record = next(iter(result)) if reader in {"lrange", "smembers"} else result

    assert record.id == UUID("00000000-0000-7000-8000-000000000001")
    assert record.created_at == datetime(2026, 10, 27, 8, 30)


@pytest.mark.asyncio
@pytest.mark.parametrize("reader", READERS)
async def test_read_without_model_preserves_raw_data(client, monkeypatch, reader):
    reply = stub_reply(monkeypatch, reader, PAYLOAD)
    assert await read(client, reader) == reply


@pytest.mark.asyncio
@pytest.mark.parametrize("reader,reply", [("get", None), ("hget", None), ("lrange", []), ("smembers", set())])
async def test_read_missing_data_preserves_empty_result(client, monkeypatch, reader, reply):
    monkeypatch.setattr(Redis, reader, AsyncMock(return_value=reply))
    assert await read(client, reader, response_model=CacheRecord) == reply
